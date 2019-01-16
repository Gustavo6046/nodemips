const MIPS = require('./index.js');
const fs = require('fs');
const machine = new MIPS.machine.MIPSMachine();
const numClocks = 50000;

function printDebugStatus() {
    /*
    console.log('Registers:', JSON.stringify(machine.registers._internal));
    console.log('Special Registers:', JSON.stringify(machine.specialRegisters));
    console.log('Error mode:', machine.errorInstructions);
    console.log();
    */
}

let assembler = MIPS.assembler.assembler();
process.stdout.write('* Assembling... ');
assembler.assemble(fs.readFileSync('test.asm', 'utf-8'), console.error);
process.stdout.write('and loading... ');
assembler.loadInMachine(machine);
process.stdout.write('done!\n');


console.log();
console.log(`--- RUNNING TEST: ${numClocks} CLOCKS ---`);
console.log();

console.log('Initial status:');
printDebugStatus();

console.log();
console.log();

let stdout = '';
let prints = 0;

machine.on('stdout', (data) => {
    prints++;
    stdout += data;
});

MIPS.machine.defaultSyscalls.apply(machine);

for (let clock = 1; clock <= numClocks; clock++) {
    /*
    let instruction;

    if (this.errorInstructions)
        instruction = machine.errorRom.readUInt32BE(machine.specialRegisters.PC);
        
    else
        instruction = machine.text.readUInt32BE(machine.specialRegisters.PC);

    console.log(`    [ Clock #${clock} ]`);
    console.log(`> Instruction (hex. raw inst):  ${machine.RAM.slice((clock - 1) * 4, clock * 4).toString('hex').toUpperCase()}`);
    let opcode = instruction >>> 26;
    console.log(`> Instruction (bin. opc. only): ${new Array(6 - opcode.toString(2).length).fill('0').join('')}${opcode.toString(2)}`);
    console.log();
    
    let opcdesc = MIPS.instructions.opcodes[opcode];
    
    if (opcdesc !== undefined) {
        let buf = Buffer.alloc(4);
        buf.writeUInt32BE(instruction);

        let inst2 = MIPS.instructions.formats[opcdesc.type].decode(buf);
        
        console.log(`> Instruction (guessed fmt: ${opcdesc.type}): ${JSON.stringify(inst2)}`);
    }
    */

    machine.clock();
    // printDebugStatus();

    if (machine.stopped)
        break;
}

console.log(`\n== PRINTED OUTPUT (${prints} syscalls wrote to stdout) ==`);
console.log(stdout);