const Long = require('long');
const assert = require('assert');

function signed(i, msb=31) {
    if (i >> msb)
        return -(((~i >>> 0) & 0xFF) + 1);

    return i;
}

module.exports = function (MIPS, MipsModule) {
    let causes = MipsModule.causes = {
        INT: 0,
        IBUS: 1,
        OVF: 2,
        SYSCALL: 3
    };

    MipsModule.formats = {
        R: {
            decode: function decodeInstruction_R(buf) {
                let res = { type: 'R' };

                assert(buf.length >= 4, new Error(`Tried to decode an R-format MIPS instruction from a ${buf.length * 8} bit buffer; at least 32 bits are required!`));

                let juice = buf.readUInt32BE();
                let c = 32;
                res.opcode = juice >>> (c -= 6);
                res.rs = juice >>> (c -= 5) & 0x1F;
                res.rt = juice >>> (c -= 5) & 0x1F;
                res.rd = juice >>> (c -= 5) & 0x1F;
                res.shift = juice >>> (c -= 5) & 0x1F;
                res.funct = juice >>> (c -= 6) & 0x3F;

                return res;
            },

            isValid: function isValidInstruction_R(ins) {
                return [ins.opcode, ins.rs, ins.rt, ins.rd, ins.shift, ins.funct].every((v) => v != null);
            },

            encode: function encodeInstruction_R(ins) {
                let res = Buffer.alloc(32);

                let ri = 0;
                let c = 32;
                ri |= (ins.opcode << (c -= 6)) >>> 0;
                ri |= (ins.rs << (c -= 5)) >>> 0;
                ri |= (ins.rt << (c -= 5)) >>> 0;
                ri |= (ins.rd << (c -= 5)) >>> 0;
                ri |= (ins.shift << (c -= 5)) >>> 0;
                ri |= (ins.funct << (c -= 6)) >>> 0;

                res.writeUInt32BE(ri >>> 0);
                return res;
            }
        },

        I: {
            decode: function decodeInstruction_I(buf) {
                let res = { type: 'I' };

                assert(buf.length >= 4, new Error(`Tried to decode an I-format MIPS instruction from a ${buf.length * 8} bit buffer; at least 32 bits are required!`));

                let juice = buf.readUInt32BE();
                let c = 32;
                res.opcode = juice >>> (c -= 6);
                res.rs = juice >>> (c -= 5) & 0x1F;
                res.rt = juice >>> (c -= 5) & 0x1F;
                res.imm = juice >>> (c -= 16) & 0xFFFF;

                return res;
            },

            isValid: function isValidInstruction_I(ins) {
                return [ins.opcode, ins.rs, ins.rt, ins.imm].every((v) => v != null);
            },

            encode: function encodeInstruction_I(ins) {
                let res = Buffer.alloc(32);

                let ri = 0;
                let c = 32;
                ri |= (ins.opcode << (c -= 6)) >>> 0;
                ri |= (ins.rs << (c -= 5)) >>> 0;
                ri |= (ins.rt << (c -= 5)) >>> 0;
                ri |= (ins.imm << (c -= 16)) >>> 0;

                res.writeUInt32BE(ri >>> 0);
                return res;
            }
        },

        J: {
            decode: function decodeInstruction_J(buf) {
                let res = { type: 'J' };

                assert(buf.length >= 4, new Error(`Tried to decode a J-format MIPS instruction from a ${buf.length * 8} bit buffer; at least 32 bits are required!`));

                let juice = buf.readUInt32BE();
                let c = 32;
                res.opcode = juice >>> (c -= 6);
                res.addr = juice >>> (c -= 26) & 0x3FFFFFF;

                return res;
            },

            isValid: function isValidInstruction_J(ins) {
                return [ins.opcode, ins.addr].every((v) => v != null);
            },
    
            encode: function encodeInstruction_R(ins) {
                let res = Buffer.alloc(32);
    
                let ri = 0;
                ri |= (ins.opcode << (32 - 6)) >>> 0;
                ri |= ins.addr >>> 0;
    
                res.writeUInt32BE(ri >>> 0);
                return res;
            }
        },
    };

    MipsModule.encode = function encodeInstruction(inst) {
        return MipsModule.formats[inst.type].encode(inst);
    };

    MipsModule.handleException = function handleMIPSException(cause, source) {
        console.warn(`Warning: MIPS exception 0x${cause.toString(16)} (${['INT', 'IBUS', 'OVF', 'SYSCALL'][cause]}) detected when running instruction: ${source}`);

        this.specialRegisters.Cause = cause << 2;
        this.specialRegisters.Cause |= this.getInterruptStateBitField() << 9;
        this.specialRegisters.Status <<= 4;
        this.specialRegisters.Status >>>= 0;

        this.specialRegisters.EPC = this.specialRegisters.PC;
        this.specialRegisters.PC = 0x17C;
        this.errorInstructions = true;
    };

    MipsModule.opcodes = {};

    // -- Arithmetic ALU Opcodes (R Mode) --
    MipsModule.opcodes[0b010000] = { // coprocessing (ignore)
        type: 'R',
        execute: function() {
            console.warn('WARNING: Coprocessors aren\'t supported by nodemips.');
            return;
        }
    };

    MipsModule.opcodes[0b000000] = { // everything else >_>
        type: 'R',
        execute: function(instr) {
            let operands = { s: this.registers.get(instr.rs), t: this.registers.get(instr.rt) };
            let res;
            let cause = causes.OVF; // default
            let err = false;

            if (instr.funct === 0b001101) { // BREAK
                this.specialRegisters.EPC = this.specialRegisters.PC;
                this.specialRegisters.PC = 0x3C;
                return;
            }

            else if (instr.funct === 0b001100) { // SYSCALL
                this.cause = causes.SYSCALL;
                this.emitSyscall(this.registers.get(2), this.registers.get(4), this.registers.get(5), this.registers.get(6), this.registers.get(7));
                
                this.specialRegisters.PC += 4;
                return;
            }

            else if (instr.funct & 0x8 && !(instr.funct & 0x2F)) { // JR/JALR
                if (instr.funct & 0x1) // JALR
                    this.registers.set(instr.rd, this.specialRegisters.PC);

                this.specialRegisters.PC = operands.s - 4;
                return;
            }

            else if (instr.funct & 0x10 && !(instr.funct & 0xF) && operands.s !== 0 && operands.t !== 0) { // MT* (move to *) instructions
                if (instr.funct & 0x2) // MTLO
                    this.specialRegisters.LO = operands.s;
                
                else // MTHI
                    this.specialRegisters.HI = operands.s;

                this.specialRegisters.PC += 4;
                return;
            }
            
            else {
                if (instr.rs === 0 && instr.rt === 0) { // MF* (move from *) instructions
                    if (instr.funct & 0x2) // MFLO
                        res = this.specialRegisters.LO;
                        
                    else // MFHI
                        res = this.specialRegisters.HI;
                }

                else if (instr.shift != 0 && (instr.funct & 0x3) !== 0x1) {
                    let subop = instr.funct & 0x3;

                    let subops = [
                        (a) => a << instr.shift,
                        null, // probably some random MIPS instruction entanglement *shrugs*
                        (a) => a >>> instr.shift,
                        (a) => a >> instr.shift,
                    ];
                    
                    res = subops[subop](operands.t);
                }

                else if (instr.funct & 0x20) {
                    if (instr.funct & 0x8) {
                        if (!(instr.funct & 0x1)) {
                            operands.s = signed(operands.s);
                            operands.t = signed(operands.t);
                        }

                        res = +(operands.s < operands.t);
                    }

                    else {
                        if (instr.funct & 0x4) {
                            let subop = instr.funct & 0x3;

                            let subops = [
                                (a, b) => a & b,
                                (a, b) => a | b,
                                (a, b) => (a ^ b) & 0xFFFFFFFF,
                                (a, b) => ~(a | b) & 0xFFFFFFFF
                            ];

                            res = subops[subop](operands.s, operands.t);
                        }

                        else {
                            if (instr.funct & 0x2)
                                res = operands.s - operands.t;
                                
                            else
                                res = operands.s + operands.t;

                            if (!(instr.funct & 1)) {
                                if ((res < 0 || res > 0xFFFFFFFF))
                                    err = true;

                                else
                                    res = res >>> 0;
                            }
                        }
                    }
                }
                
                else if (instr.funct & 0xF) {
                    if (!(instr.funct & 0x1)) {
                        operands.s = signed(operands.s);
                        operands.t = signed(operands.t);
                    }

                    if (instr.funct & 0x2) {
                        if (operands.t === 0) {
                            err = true; // division by zero
                        }

                        else {
                            res = this.specialRegisters.HI = Math.floor(operands.s / operands.t);
                            this.specialRegisters.LO = operands.s - operands.t * Math.floor(operands.s / operands.t);
                        }
                    }
                        
                    else {
                        let dwordRes = new Long(operands.s).mul(new Long(operands.t));
                        this.specialRegisters.HI = dwordRes.high >>> 0;
                        this.specialRegisters.LO = res = dwordRes.low >>> 0;
                    }

                    if (!err) {
                        this.specialRegisters.PC += 4;
                        return;
                    }
                }

                else if (instr.funct & 0x4) {
                    let subop = instr.funct & 0x3;

                    let subops = [
                        (a, b) => a << b,
                        null, // more entanglement! yay!
                        (a, b) => a >>> b,
                        (a, b) => a >> b,
                    ];
                    
                    res = subops[subop](operands.t, operands.s);
                }

                if (!err) {
                    this.registers.set(instr.rd, res);
                    this.specialRegisters.PC += 4;
                }

                else MipsModule.handleException.bind(this)(cause, JSON.stringify(instr));
            }
        },
    };

    // -- Immediate Opcodes (I Mode) --
    MipsModule.opcodes[0b001000] = { // ADDI
        type: 'I',
        execute: function (instr) {
            let operands = { s: this.registers.get(instr.rs), i: instr.imm };
            let res;

            res = signed(operands.s) + signed(operands.i);
            
            this.registers.set(instr.rt, res);
            this.specialRegisters.PC += 4;
        }
    };  

    MipsModule.opcodes[0b001001] = { // ADDIU
        type: 'I',
        execute: function (instr) {
            let operands = { s: this.registers.get(instr.rs), i: instr.imm };
            let res;

            res = operands.s + operands.i;

            this.registers.set(instr.rt, res);
            this.specialRegisters.PC += 4;
        }
    };  

    MipsModule.opcodes[0b001100] = { // ANDI
        type: 'I',
        execute: function (instr) {
            let operands = { s: this.registers.get(instr.rs), i: instr.imm };
            let res;

            res = operands.s & operands.i;

            this.registers.set(instr.rt, res);
            this.specialRegisters.PC += 4;
        }
    };  

    MipsModule.opcodes[0b001111] = { // LUI
        type: 'I',
        execute: function (instr) {
            let operands = { i: instr.imm };
            let res;

            res = operands.i << 16;

            this.registers.set(instr.rt, res);
            this.specialRegisters.PC += 4;
        }
    };

    MipsModule.opcodes[0b001101] = { // ORI
        type: 'I',
        execute: function (instr) {
            let operands = { s: this.registers.get(instr.rs), i: instr.imm };
            let res;

            res = operands.s | operands.i;

            this.registers.set(instr.rt, res);
            this.specialRegisters.PC += 4;
        }
    };

    MipsModule.opcodes[0b001010] = { // SLTI
        type: 'I',
        execute: function (instr) {
            let operands = { s: this.registers.get(instr.rs), i: instr.imm };
            let res;

            res = +(operands.s < signed(operands.i));

            this.registers.set(instr.rt, res);
            this.specialRegisters.PC += 4;
        }
    };

    MipsModule.opcodes[0b001011] = { // SLTIU
        type: 'I',
        execute: function (instr) {
            let operands = { s: this.registers.get(instr.rs), i: instr.imm };
            let res;

            res = +(operands.s < operands.i);

            this.registers.set(instr.rt, res);
            this.specialRegisters.PC += 4;
        }
    };

    MipsModule.opcodes[0b001110] = { // XORI
        type: 'I',
        execute: function (instr) {
            let operands = { s: this.registers.get(instr.rs), i: instr.imm };
            let res;

            res = +(operands.s ^ operands.i);

            this.registers.set(instr.rt, res);
            this.specialRegisters.PC += 4;
        }
    };

    MipsModule.opcodes[0b000100] = { // BEQ
        type: 'I',
        execute: function (instr) {
            let operands = { s: this.registers.get(instr.rs), t: this.registers.get(instr.rt), i: instr.imm };

            if (operands.s === operands.t)
                this.specialRegisters.PC += 4 * operands.i;

            else
                this.specialRegisters.PC += 4;
        }
    };

    MipsModule.opcodes[0b000001] = { // BG[E]Z[AL]
        type: 'I',
        execute: function (instr) {
            let operands = { s: this.registers.get(instr.rs), t: this.registers.get(instr.rt), i: instr.imm };

            if (operands.r & 0x10)
                this.registers.set(31, this.specialRegisters.PC + 4);

            if (operands.r & 0x1 ? operands.s >= 0 : operands.s < 0)
                this.specialRegisters.PC += 4 * operands.i;

            else
                this.specialRegisters.PC += 4;
        }
    };
    
    MipsModule.opcodes[0b000111] = { // BGTZ
        type: 'I',
        execute: function (instr) {
            let operands = { s: this.registers.get(instr.rs), t: this.registers.get(instr.rt), i: instr.imm };

            if (operands.s > 0)
                this.specialRegisters.PC += 4 * operands.i;            

            else
                this.specialRegisters.PC += 4;
        }
    };

    MipsModule.opcodes[0b000110] = { // BLEZ
        type: 'I',
        execute: function (instr) {
            let operands = { s: this.registers.get(instr.rs), t: this.registers.get(instr.rt), i: instr.imm };

            if (operands.s <= 0)
                this.specialRegisters.PC += 4 * operands.i;            

            else
                this.specialRegisters.PC += 4;
        }
    };

    MipsModule.opcodes[0b000101] = { // BNE
        type: 'I',
        execute: function (instr) {
            let operands = { s: this.registers.get(instr.rs), t: this.registers.get(instr.rt), i: instr.imm };

            if (operands.s != operands.t)
                this.specialRegisters.PC += 4 * operands.i;            

            else
                this.specialRegisters.PC += 4;
        }
    };

    // * RAM memory manipulation
    MipsModule.opcodes[0b100000] = { // LB
        type: 'I',
        execute: function (instr) {
            let operands = { s: this.registers.get(instr.rs), i: instr.imm };
            let vis = this.visibleRAM(operands.s + operands.i);
            let res = vis.space.readInt8(vis.newAddr);

            this.registers.set(instr.rt, res);
            this.specialRegisters.PC += 4;
        }
    };

    /*
    MipsModule.opcodes[0b111111] = { // PRINT
        type: 'I',
        execute: function (instr) {
            let operands = { s: this.registers.get(instr.rs), i: instr.imm };
            console.log(operands.s + operands.i);
            this.registers.set(instr.rt, operands.s + operands.i);
            this.specialRegisters.PC += 4;
        }
    };
    */

    MipsModule.opcodes[0b100100] = { // LBU
        type: 'I',
        execute: function (instr) {
            let operands = { s: this.registers.get(instr.rs), i: instr.imm };
            let vis = this.visibleRAM(operands.s + operands.i);
            let res = vis.space.readUInt8(vis.newAddr);

            this.registers.set(instr.rt, res);
            this.specialRegisters.PC += 4;
        }
    };

    MipsModule.opcodes[0b100001] = { // LH
        type: 'I',
        execute: function (instr) {
            let operands = { s: this.registers.get(instr.rs), i: instr.imm };
            let vis = this.visibleRAM(operands.s + operands.i);
            let res = vis.space.readInt16LE(vis.newAddr);

            this.registers.set(instr.rt, res);
            this.specialRegisters.PC += 4;
        }
    };

    MipsModule.opcodes[0b100101] = { // LHU
        type: 'I',
        execute: function (instr) {
            let operands = { s: this.registers.get(instr.rs), i: instr.imm };
            let vis = this.visibleRAM(operands.s + operands.i);
            let res = vis.space.readUInt16(vis.newAddr);

            this.registers.set(instr.rt, res);
            this.specialRegisters.PC += 4;
        }
    };

    MipsModule.opcodes[0b100011] = { // LW
        type: 'I',
        execute: function (instr) {
            let operands = { s: this.registers.get(instr.rs), i: instr.imm };
            let vis = this.visibleRAM(operands.s + operands.i);
            let res = vis.space.readInt32LE(vis.newAddr);

            this.registers.set(instr.rt, res);
            this.specialRegisters.PC += 4;
        }
    };

    MipsModule.opcodes[0b100111] = { // LWU
        type: 'I',
        execute: function (instr) {
            let operands = { s: this.registers.get(instr.rs), i: instr.imm };
            let vis = this.visibleRAM(operands.s + operands.i);
            let res = vis.space.readUInt32LE(vis.newAddr);

            this.registers.set(instr.rt, res);
            this.specialRegisters.PC += 4;
        }
    };

    MipsModule.opcodes[0b101000] = { // SB
        type: 'I',
        execute: function (instr) {
            let operands = { s: this.registers.get(instr.rs), i: instr.imm, t: this.registers.get(instr.rt) };
            let vis = this.visibleRAM(operands.s + operands.i);
            vis.space.writeInt8(vis.newAddr, operands.t & 0xFF);

            this.specialRegisters.PC += 4;
        }
    };

    MipsModule.opcodes[0b101001] = { // SH
        type: 'I',
        execute: function (instr) {
            let operands = { s: this.registers.get(instr.rs), i: instr.imm, t: this.registers.get(instr.rt) };
            let vis = this.visibleRAM(operands.s + operands.i);
            vis.space.writeInt16LE(vis.newAddr, operands.t & 0xFF);

            this.specialRegisters.PC += 4;
        }
    };

    MipsModule.opcodes[0b101011] = { // SW
        type: 'I',
        execute: function (instr) {
            let operands = { s: this.registers.get(instr.rs), i: instr.imm, t: this.registers.get(instr.rt) };
            let vis = this.visibleRAM(operands.s + operands.i);
            vis.space.writeInt32LE(vis.newAddr, operands.t & 0xFF);

            this.specialRegisters.PC += 4;
        }
    };

    MipsModule.opcodes[0b101100] = { // SBU
        type: 'I',
        execute: function (instr) {
            let operands = { s: this.registers.get(instr.rs), i: instr.imm, t: this.registers.get(instr.rt) };
            let vis = this.visibleRAM(operands.s + operands.i);
            vis.space.writeUInt8(vis.newAddr, operands.t & 0xFF);

            this.specialRegisters.PC += 4;
        }
    };

    MipsModule.opcodes[0b101101] = { // SHU
        type: 'I',
        execute: function (instr) {
            let operands = { s: this.registers.get(instr.rs), i: instr.imm, t: this.registers.get(instr.rt) };
            let vis = this.visibleRAM(operands.s + operands.i);
            vis.space.writeUInt16LE(vis.newAddr, operands.t & 0xFF);

            this.specialRegisters.PC += 4;
        }
    };

    MipsModule.opcodes[0b101111] = { // SWU
        type: 'I',
        execute: function (instr) {
            let operands = { s: this.registers.get(instr.rs), i: instr.imm, t: this.registers.get(instr.rt) };
            let vis = this.visibleRAM(operands.s + operands.i);
            vis.space.writeUInt32LE(vis.newAddr, operands.t & 0xFF);

            this.specialRegisters.PC += 4;
        }
    };

    // -- Jump Opcodes (J Mode) --
    MipsModule.opcodes[0b000010] = { // J (aka JMP)
        type: 'J',
        execute: function(instr) {
            this.specialRegisters.PC = (this.specialRegisters.PC & 0xFC000000) | (instr.addr << 2);
            console.log(instr.addr, this.specialRegisters.PC);
        }
    };

    MipsModule.opcodes[0b000010] = { // JAL
        type: 'J',
        execute: function(instr) {
            this.registers.set(31, this.specialRegisters.PC + 4);
            this.specialRegisters.PC = (this.specialRegisters.PC & 0xFC000000) | (instr.addr << 2) - 4;
        }
    };
  
    // ===========================

    MipsModule.clock = function(instruction) {
        let opcode = instruction >>> 26;
        let opcdesc;

        if ((opcdesc = MipsModule.opcodes[opcode]) === undefined)
            MipsModule.handleException.bind(this)(causes.IBUS, instruction);

        else {
            let buf = Buffer.alloc(4);
            buf.writeUInt32BE(instruction);
            opcdesc.execute.bind(this)(MipsModule.formats[opcdesc.type].decode(buf));
        }
    };
};