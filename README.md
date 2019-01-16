# nodemips

nodemips is a MIPS assembling, emulation, and (essentially) manipulation
library. You can use it within other projects for your MIPS needs, or
simply run it to run a basic MIPS program.

## How to Use

Library API documentation is yet to come. To run the simple test pogram
(`test.asm`), which is a demonstration that comes with `nodemips`,
simply run `test.js` (or `nodemips-demo` if globally installed via npm).

## Key Aspects

### Performance

Performance is decent for simpler programs, but there is most likely much
room for optimization. For comparison, the super-minimalistic test program
(`test.asm`), when run by `test.js`, takes around a second to run with debug
logs, but a small fraction of a second without debug logs.

### Current emulation accuracy

_Note: nodemips is still in an alpha stage, which means it doesn't have as
many features as it aims to eventually have._

* **Don't expect an existing MIPS program, e.g. Super Mario 64, to run in
  nodemips.** While architecture accuracy was a concern, this emulator simply
  executes MIPS I instructions in a generic machine. It won't emulate
  console-specific details, like graphics registers and interrupts for the
  Nintendo 64.
  
  Also, MIPS programs will most likely come in an executable
  format, like ELF; nodemips follows a specific procedure in order to
  execute a program. The easiest way to create a nodemips program is by
  using the assembler (don't try to execute individual lines using
  the assembler, it _won't work_). One may also set the Program Counter
  (PC) to the address of the first instruction (usually, this address
  will be in the `text` buffer space, i.e. between 0x00400000 and
  0x0FFFFFFF), and set the initial values in the RAM, VRAM, error
  handling instructions ROM, and maybe even the stack buffer, before
  starting the machine, by either calling `clock` many times (although
  this method won't allow blocking processes like reading on `stdin`),
  or using the `start`, `toggle` (pause/unpause) and `stop` methods
  (which might give lesser control over the flow of the CPU 'cycles').

* It has a 320x200 VGA mode 13h
  memory and palette buffers, which may be used in order to display
  graphics, granted that you can see the JIMP image returned by
  the `MIPSMachine.getVGA` async method. To set the R, G and B of the
  color #i in the VGA palette, simply `syscall` with `$v0 = 0x3C` (which
  is 60, since, unlike i386 implementations of VGA, syscall slot `0x10`
  is taken), then set `$a0`, `$a1`, `$a2`, `$a3` to, respectively, the
  index i, and the red, green and blue channel values.

* Only a handful syscalls - printing, and (untested) `stdin` reading -, are
  supported at the moment.

* The filesystem is not currently implemented. While it may eventually be
  implemented in the Node.JS version, the browserify version will never
  support a filesystem, due to the basic limitations of `localStorage` (or
  any other persistent or permanent data storage mechanism) in browser
  JavaScript engines.

* Sound is not yet supported.