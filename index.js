const MIPS = {};


MIPS.registers = {};
MIPS.instructions = {};
MIPS.machine = {};

require('./parts/md_registers.js')(MIPS, MIPS.registers);
require('./parts/mi_instruct.js')(MIPS, MIPS.instructions);
require('./parts/mi_machine.js')(MIPS, MIPS.machine);

module.exports = MIPS;