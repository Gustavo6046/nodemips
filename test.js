const MIPS = require('./index.js');
const util = require('util');
const machine = new MIPS.machine.MIPSMachine();
const numClocks = 10;

function printDebugStatus() {
    console.log('Registers:', JSON.stringify(machine.registers._internal));
    console.log('Special Registers:', JSON.stringify(machine.specialRegisters));
    console.log();
}

let cur = 0;

let instructions = [
    { type: 'I', opcode: 0b001000,              rs: 0,  rt: 8,  imm: 80 },
    { type: 'I', opcode: 0b001000,              rs: 8,  rt: 8,  imm: 70 },
    { type: 'I', opcode: 0b001000,              rs: 8,  rt: 8,  imm: 50 },
    { type: 'I', opcode: 0b001000,              rs: 0,  rt: 9,  imm: 7 },
    { type: 'I', opcode: 0b001000,              rs: 0,  rt: 10, imm: 3 },
    { type: 'R', opcode: 0, funct: 0b011001,    rs: 8,  rt: 9,  rd: 0 },
    { type: 'R', opcode: 0, funct: 0b010000,    rs: 0,  rt: 0,  rd: 11}, // MFHI
    { type: 'R', opcode: 0, funct: 0b011011,    rs: 11, rt: 10, rd: 0 },
    { type: 'R', opcode: 0, funct: 0b010000,    rs: 0,  rt: 0,  rd: 11}, // MFLO
];

instructions.forEach((i) => {
    machine.RAM.writeUInt32BE(MIPS.instructions.formats[i.type].encode(i).readUInt32BE(), cur);
    cur += 4;
});

console.log('Added instructions:');

instructions.forEach((inst) => {
    console.log(util.inspect(inst));
});

console.log();
console.log(`--- RUNNING TEST: ${numClocks} CLOCKS ---`);
console.log();

console.log('Initial status:');
printDebugStatus();

console.log();
console.log();

for (let clock = 1; clock <= numClocks; clock++) {
    let instruction = machine.RAM.readUInt32BE((clock - 1) * 4);

    console.log(`> Clock #${clock}`);
    console.log(`> Instruction (raw): ${machine.RAM.slice((clock - 1) * 4, clock * 4).toString('hex').toUpperCase()}`);

    let opcode = instruction >> 26;
    let opcdesc = MIPS.instructions.opcodes[opcode];

    if (opcdesc !== undefined) {
        let buf = Buffer.alloc(4);
        buf.writeUInt32BE(instruction);

        let inst2 = MIPS.instructions.formats[opcdesc.type].decode(buf);
        
        console.log(`> Instruction (guessed fmt: ${opcdesc.type}): ${JSON.stringify(inst2)}`);
    }

    machine.clock();
    printDebugStatus();
}