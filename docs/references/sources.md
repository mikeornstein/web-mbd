# Sources and bibliography

Research snapshot for web-mbd solver prior-art docs. Links were accessed during the research pass; upstream pages evolve.

## OpenRadioss primary

- OpenRadioss Confluence home: https://openradioss.atlassian.net/wiki/spaces/OPENRADIOSS/overview?homepageId=1016017
- HMPP Development Insights (Amdahl, Metis, starter/engine, explicit loop, Parallel Arithmetic): https://openradioss.atlassian.net/wiki/spaces/OPENRADIOSS/pages/2359297
- Coding Recommendations (restart vars, allocation, modules): https://openradioss.atlassian.net/wiki/spaces/OPENRADIOSS/pages/3899393
- Performance Aspects — Vectorization and Optimization (MVSIZ, SoA): https://openradioss.atlassian.net/wiki/spaces/OPENRADIOSS/pages/4423681
- Reader (Radioss Block Format, cfg): https://openradioss.atlassian.net/wiki/spaces/OPENRADIOSS/pages/6094849
- Pre and Post Processing: https://openradioss.atlassian.net/wiki/spaces/OPENRADIOSS/pages/21397510
- Running OpenRadioss / qa-tests: https://openradioss.atlassian.net/wiki/spaces/OPENRADIOSS/pages/19628079
- HPC Benchmark Models (Neon 1M, Taurus 10M): https://openradioss.atlassian.net/wiki/spaces/OPENRADIOSS/pages/47546369
- Blow Molding with AMS: https://openradioss.atlassian.net/wiki/spaces/OPENRADIOSS/pages/9011303
- Example LS-DYNA Format Models: https://openradioss.atlassian.net/wiki/spaces/OPENRADIOSS/pages/17629185
- Camry Impact Model (LS-DYNA format): https://openradioss.atlassian.net/wiki/spaces/OPENRADIOSS/pages/10518559
- GitHub: https://github.com/OpenRadioss/OpenRadioss (AGPL-3.0)
- LICENSE / COPYRIGHT: https://github.com/OpenRadioss/OpenRadioss/blob/main/LICENSE.md
- ModelExchange: https://github.com/OpenRadioss/ModelExchange
- Tools (inp2rad, converters): https://github.com/OpenRadioss/Tools
- Website / models: https://www.openradioss.org/ and https://openradioss.org/models/
- Engine explicit driver: `engine/source/engine/resol.F`

## Altair Radioss documentation

- Theory Manual 2022 (PDF): https://2022.help.altair.com/2022/simulation/pdfs/radopen/AltairRadioss_2022_TheoryManual.pdf
- Run Radioss / starter–engine process: https://help.altair.com/hwsolvers/rad/topics/solvers/rad/rad_user_guide_intro_c.htm
- LS-DYNA keyword mapping / limitations: https://help.altair.com/hwsolvers/rad/topics/solvers/rad/ls_dyna_keywords_r.htm
- Results checking (energy error, DM/M): https://help.altair.com/hwsolvers/rad/topics/solvers/rad/faq_rad_results_checking_r.htm
- LS-DYNA→Radioss conversion mapping tables: https://2022.help.altair.com/2022.1/hwdesktop/hwx/topics/conversion_between_solvers/convert_lsdyna_to_radioss_mapping.htm

## Community / ecosystem

- Silent unsupported LS-DYNA features discussion: https://github.com/OpenRadioss/OpenRadioss/issues/1491
- OpenRadioss-WebGUI: https://github.com/alekssadowski95/OpenRadioss-WebGUI
- AWS HPC OpenRadioss recipes: https://github.com/aws-samples/hpc-applications/tree/main/apps/OpenRadioss
- CarCrashNet (OpenRadioss vs LS-DYNA vehicle metrics): https://github.com/mohamedelrefaie/carcrashnet
- PrePoMax discourse on CalculiX explicit vs OpenRadioss: https://prepomax.discourse.group/t/bar-impact-explicit-dynamics/3202

## Validation benchmarks

- NAFEMS contact benchmarks R0081 / R0094: https://www.nafems.org/publications/resource_center/r0081/ and https://www.nafems.org/publications/resource_center/r0094/
- Taylor bar / bar impact verification example (OptiStruct OS-V:1200): https://2025.help.altair.com/2025.1/hwsolvers/os/topics/solvers/os/bar_impact_taylor_test_verification_r.htm
- SimScale NAFEMS punch contact case: https://www.simscale.com/docs/validation-cases/3d-punch-rounded-edges-nafems-contact-benchmark-2/

## Flexible multibody / Chrono

- Project Chrono: https://projectchrono.org/
- Chrono Springer overview PDF: https://projectchrono.org/assets/white_papers/chronoSpringer.pdf
- ANCF validation / whitepapers: https://www.projectchrono.org/assets/validations/FEA/ancfBeamValidation.pdf , https://sbel.wisc.edu/wp-content/uploads/sites/569/2018/05/TR-2016-11.pdf
- chrono.wasm experiment: https://github.com/discere-os/chrono.wasm
- GPU total-Lagrangian FMBD (arXiv): https://arxiv.org/html/2604.10357v4

## Modern FE / GPU frameworks

- MFEM high-performance FE survey: https://doi.org/10.48550/arxiv.2402.15940
- libCEED / MFEM workshop notes: https://mfem.org/pdf/workshop23/17_Dudouit_MFEM_libCEED.pdf
- deal.II matrix-free GPU comparisons (SC17 poster): https://sc17.supercomputing.org/SC17%20Archive/tech_poster/poster_files/post182s2-file3.pdf

## Browser geometry, mesh, FE demos

- occt-wasm: https://github.com/ehtick/occt-wasm
- brepjs: https://brepjs.dev/
- brepkit: https://github.com/andymai/brepkit/
- OpenGeometry: https://github.com/OpenGeometry-io/OpenGeometry/
- GMSH-JS: https://github.com/loumalouomega/GMSH-JS
- Tetrament (WebGPU softbody FEM): https://github.com/zalo/Tetrament/
- FEAScript: https://github.com/FEAScript/FEAScript-core
- fea_app WebGPU PCG: https://github.com/RomanShushakov/fea_app
- vtk.js / Kitware Glance: https://github.com/kitware/glance/

## Agentic CAE / MCP

- CAE-Agent-Hub (Abaqus/Fluent/HyperWorks MCP): https://github.com/Cai-aa/CAE-Agent-Hub
- OASiS multi-code FEM MCP: https://github.com/Hereon-InstituteMS/OASiS
- Ennova agentic CAD→CFD + MCP narrative: LinkedIn / Ennova Technologies posts on MCP for CAE
- MCP conceptual overview: https://www.vectara.com/blog/mcp-the-control-plane-of-agentic-ai

## Other FEA landscape context

- FEAssistant free FEA options overview: https://feassistant.com/top-free-options-for-finite-element-analysis-fea/
- CalculiX / Code_Aster comparisons (general): various industry blogs; treat as secondary
