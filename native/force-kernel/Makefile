libforce_kernel.so: force_kernel.c force_kernel.h
	cc -O2 -fPIC -shared -o $@ force_kernel.c -lm

or_bridge.o: or-extract/or_bridge.c or-extract/or_bridge.h force_kernel.h
	cc -O2 -fPIC -c -o $@ or-extract/or_bridge.c -I. -Ior-extract

selftest: force_kernel_selftest.c libforce_kernel.so
	cc -O2 -o force_kernel_selftest force_kernel_selftest.c -L. -lforce_kernel -lm -Wl,-rpath,'$$ORIGIN'

golden-test: force_kernel_golden.c libforce_kernel.so
	cc -O2 -o force_kernel_golden force_kernel_golden.c -L. -lforce_kernel -lm -Wl,-rpath,'$$ORIGIN'

.PHONY: selftest golden-test clean smoke-or smoke-or-hex
smoke-or: or-extract/smoke_symbols.c
	cc -O2 -o or-extract/smoke_symbols or-extract/smoke_symbols.c -ldl
	./or-extract/smoke_symbols or-extract/build/libor_h8c.so

smoke-or-hex: or-extract/smoke_or_hex.c
	cc -O2 -o or-extract/build/smoke_or_hex or-extract/smoke_or_hex.c -ldl -lm
	./or-extract/build/smoke_or_hex or-extract/build/libwmbd_or_hex.so
	WMBD_OR_CALL_S8E=1 ./or-extract/build/smoke_or_hex or-extract/build/libwmbd_or_hex.so

clean:
	rm -f libforce_kernel.so force_kernel_selftest force_kernel_golden or_bridge.o \
		or-extract/smoke_symbols or-extract/build/smoke_or_hex
