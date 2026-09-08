libforce_kernel.so: force_kernel.c force_kernel.h
	cc -O2 -fPIC -shared -o $@ force_kernel.c -lm

selftest: force_kernel_selftest.c libforce_kernel.so
	cc -O2 -o force_kernel_selftest force_kernel_selftest.c -L. -lforce_kernel -lm -Wl,-rpath,'$$ORIGIN'

golden-test: force_kernel_golden.c libforce_kernel.so
	cc -O2 -o force_kernel_golden force_kernel_golden.c -L. -lforce_kernel -lm -Wl,-rpath,'$$ORIGIN'

.PHONY: selftest golden-test clean
clean:
	rm -f libforce_kernel.so force_kernel_selftest force_kernel_golden
