/**
 * Large-stack pthread bridge for OR one-hex and mesh (NEL>1) force entries.
 * Node's JS thread stack is too small for S8EFORC3's MVSIZ locals.
 */
#include <dlfcn.h>
#include <pthread.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
  double density, young, poisson, yield_stress, hardening;
} WmbdMat;

typedef int (*or_hex_fn)(const double *, const double *, const WmbdMat *, double *, double *, double *,
                         double *, double *, double *, double, double *);

typedef int (*or_mesh_fn)(int, int, const double *, const double *, const int *, const WmbdMat *,
                          double *, double *, double *, double *, double *, double *, double, double *);

enum { JOB_HEX = 1, JOB_MESH = 2 };

typedef struct {
  int job_kind;
  or_hex_fn hex_fn;
  or_mesh_fn mesh_fn;
  /* hex */
  const double *x0;
  const double *v0;
  const WmbdMat *mat;
  double *stress;
  double *eqps;
  double *vol0;
  double *smstr;
  double *offg;
  double *hist;
  double dt;
  double *f_out;
  /* mesh */
  int n_hex;
  int n_nodes;
  const double *x_mesh;
  const double *v_mesh;
  const int *conn;
  int rc;
  int have_job;
  int shutdown;
} OrWorkerState;

static pthread_mutex_t g_mu = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t g_cv_job = PTHREAD_COND_INITIALIZER;
static pthread_cond_t g_cv_done = PTHREAD_COND_INITIALIZER;
static OrWorkerState g_state;
static pthread_t g_worker;
static int g_worker_started = 0;
static or_hex_fn g_hex_fn = NULL;
static or_mesh_fn g_mesh_fn = NULL;

static void *or_worker_main(void *arg) {
  (void)arg;
  for (;;) {
    pthread_mutex_lock(&g_mu);
    while (!g_state.have_job && !g_state.shutdown) {
      pthread_cond_wait(&g_cv_job, &g_mu);
    }
    if (g_state.shutdown) {
      pthread_mutex_unlock(&g_mu);
      return NULL;
    }
    int kind = g_state.job_kind;
    or_hex_fn hex_fn = g_state.hex_fn;
    or_mesh_fn mesh_fn = g_state.mesh_fn;
    const double *x0 = g_state.x0;
    const double *v0 = g_state.v0;
    const WmbdMat *mat = g_state.mat;
    double *stress = g_state.stress;
    double *eqps = g_state.eqps;
    double *vol0 = g_state.vol0;
    double *smstr = g_state.smstr;
    double *offg = g_state.offg;
    double *hist = g_state.hist;
    double dt = g_state.dt;
    double *f_out = g_state.f_out;
    int n_hex = g_state.n_hex;
    int n_nodes = g_state.n_nodes;
    const double *x_mesh = g_state.x_mesh;
    const double *v_mesh = g_state.v_mesh;
    const int *conn = g_state.conn;
    pthread_mutex_unlock(&g_mu);

    int rc = -97;
    if (kind == JOB_HEX && hex_fn) {
      rc = hex_fn(x0, v0, mat, stress, eqps, vol0, smstr, offg, hist, dt, f_out);
    } else if (kind == JOB_MESH && mesh_fn) {
      rc = mesh_fn(n_hex, n_nodes, x_mesh, v_mesh, conn, mat, stress, eqps, vol0, smstr, offg, hist, dt,
                   f_out);
    }

    pthread_mutex_lock(&g_mu);
    g_state.rc = rc;
    g_state.have_job = 0;
    pthread_cond_signal(&g_cv_done);
    pthread_mutex_unlock(&g_mu);
  }
}

static int ensure_worker(void) {
  if (g_worker_started) return 0;
  if (!g_hex_fn) {
    g_hex_fn = (or_hex_fn)dlsym(RTLD_DEFAULT, "wmbd_hex_internal_forces_or");
    if (!g_hex_fn) return -98;
  }
  if (!g_mesh_fn) {
    g_mesh_fn = (or_mesh_fn)dlsym(RTLD_DEFAULT, "wmbd_mesh_internal_forces_or");
    /* mesh optional at link time for older builds — probe will fail clearly */
  }
  memset(&g_state, 0, sizeof(g_state));
  g_state.hex_fn = g_hex_fn;
  g_state.mesh_fn = g_mesh_fn;
  g_state.rc = -97;

  pthread_attr_t attr;
  pthread_attr_init(&attr);
  if (pthread_attr_setstacksize(&attr, 64 * 1024 * 1024) != 0) {
    pthread_attr_destroy(&attr);
    return -96;
  }
  if (pthread_create(&g_worker, &attr, or_worker_main, NULL) != 0) {
    pthread_attr_destroy(&attr);
    return -96;
  }
  pthread_attr_destroy(&attr);
  g_worker_started = 1;
  return 0;
}

int wmbd_hex_internal_forces_or_pthread(
    const double x0[24],
    const double v0[24],
    const WmbdMat *mat,
    double stress_io[48],
    double eqps_io[8],
    double vol0_io[8],
    double smstr_io[21],
    double *offg_io,
    double hist_io[32],
    double dt,
    double f_out[24]) {
  int start_rc = ensure_worker();
  if (start_rc != 0) return start_rc;

  pthread_mutex_lock(&g_mu);
  g_state.job_kind = JOB_HEX;
  g_state.x0 = x0;
  g_state.v0 = v0;
  g_state.mat = mat;
  g_state.stress = stress_io;
  g_state.eqps = eqps_io;
  g_state.vol0 = vol0_io;
  g_state.smstr = smstr_io;
  g_state.offg = offg_io;
  g_state.hist = hist_io;
  g_state.dt = dt;
  g_state.f_out = f_out;
  g_state.rc = -97;
  g_state.have_job = 1;
  pthread_cond_signal(&g_cv_job);
  while (g_state.have_job) {
    pthread_cond_wait(&g_cv_done, &g_mu);
  }
  int rc = g_state.rc;
  pthread_mutex_unlock(&g_mu);
  return rc;
}

int wmbd_mesh_internal_forces_or_pthread(
    int n_hex,
    int n_nodes,
    const double *x,
    const double *v,
    const int *conn,
    const WmbdMat *mat,
    double *stress_io,
    double *eqps_io,
    double *vol0_io,
    double *smstr_io,
    double *offg_io,
    double *hist_io,
    double dt,
    double *f_out) {
  int start_rc = ensure_worker();
  if (start_rc != 0) return start_rc;
  if (!g_mesh_fn) return -98;

  pthread_mutex_lock(&g_mu);
  g_state.job_kind = JOB_MESH;
  g_state.n_hex = n_hex;
  g_state.n_nodes = n_nodes;
  g_state.x_mesh = x;
  g_state.v_mesh = v;
  g_state.conn = conn;
  g_state.mat = mat;
  g_state.stress = stress_io;
  g_state.eqps = eqps_io;
  g_state.vol0 = vol0_io;
  g_state.smstr = smstr_io;
  g_state.offg = offg_io;
  g_state.hist = hist_io;
  g_state.dt = dt;
  g_state.f_out = f_out;
  g_state.rc = -97;
  g_state.have_job = 1;
  pthread_cond_signal(&g_cv_job);
  while (g_state.have_job) {
    pthread_cond_wait(&g_cv_done, &g_mu);
  }
  int rc = g_state.rc;
  pthread_mutex_unlock(&g_mu);
  return rc;
}
