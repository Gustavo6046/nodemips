module.exports = function (MIPS, MipsModule) {
    MipsModule.pseudoInstructions = {
        LI: function(args) {
            let imm = +args[1];
            let iu = imm >>> 16;
            let lu = imm & 0xFFFF;

            return [
                `LUI $at, ${iu}`,
                `ORI ${args[0]}, $at, ${lu}`
            ];
        },

        ABS: function(args) {
            return [
                `ADDU ${args[0]}, ${args[1]}, $0`,
                `BGEZ ${args[1]}, 2`,
                `SUB ${args[0]}, ${args[1]}, $0`
            ];
        },

        MOVE: function(args) {
            return [
                `ADD ${args[0]}, ${args[1]}, $0`
            ];
        },

        LA: function(args) {
            return [
                'LUI $at, 4097',
                `ORI ${args[0]}, $at, ${args[1]}`
            ];
        },

        BLT: function(args) {
            return [
                `SLT $at, ${args[0]}, ${args[1]}`,
                `BNE $at, $0, ${args[2]}`
            ];
        }
    };

    MipsModule.registerNames = {
        zero: 0,
        at: 1,
        v0: 2,
        v1: 3,
        a0: 4,
        a1: 5,
        a2: 6,
        a3: 7,
        t0: 8,
        t1: 9,
        t2: 10,
        t3: 11,
        t4: 12,
        t5: 13,
        t6: 14,
        t7: 15,
        s0: 16,
        s1: 17,
        s2: 18,
        s3: 19,
        s4: 20,
        s5: 21,
        s6: 22,
        s7: 23,
        t8: 24,
        t9: 25,
        k0: 26,
        k1: 27,
        gp: 28,
        sp: 29,
        fp: 30,
        ra: 31,
    };

    MipsModule.parseJumpAddr = function (a, onError) {
        if (a.match(/^d+$/))
            return +a;

        else if (this._labelOffs[a] != null)
            return (this._labelOffs[a] & 0xFFFFFFFF) >>> 2;

        else {
            if (onError != null)
                onError(new Error('Tried to compile jump statement with no such address or label: ' + a));

            return 0;
        }
    };

    MipsModule.parseRegister = function (r, onError) {
        if (!r.startsWith('$')) {
            return 0; // dammit!
        }

        else {
            let rn = r.slice(1);

            if (r.match(/^\$\d+$/))
                return +(r.slice(1));

            if (!rn.match(/^\d+$/)) {
                if (MipsModule.registerNames[rn] == null) {
                    if (onError != null)
                        onError(new Error('Tried to compile invalid register argument: ' + r));

                    return 0;
                } else
                    return MipsModule.registerNames[rn];
            } else
                return Math.floor(+rn);
        }
    };

    function _R(name, opc, funct, args, onError) {
        return {
            name: name,
            type: 'R',
            opcode: opc,
            funct: funct,
            shift: 0,

            rd: MipsModule.parseRegister(args[0], onError),
            rs: MipsModule.parseRegister(args[1], onError),
            rt: MipsModule.parseRegister(args[2], onError),
        };
    }

    function _Rn(name, opc, funct) { // bastard R-opcodes _without any argument_ D:<
        return {
            name: name,
            type: 'R',
            opcode: opc,
            funct: funct,
            shift: 0,

            rd: 0,
            rs: 0,
            rt: 0
        };
    }

    function _Rsh(name, opc, funct, args, onError) { // 'immediate' shifting... wtf, MIPS! Why not I mode?!
        return {
            name: name,
            type: 'R',
            opcode: opc,
            funct: funct,
            shift: +args[2],

            rd: MipsModule.parseRegister(args[0], onError),
            rs: 0,
            rt: MipsModule.parseRegister(args[1], onError),
        };
    }

    function _Rhl(name, opc, funct, args, onError) { // bastard opcodes without rd
        return {
            name: name,
            type: 'R',
            opcode: opc,
            funct: funct,
            shift: 0,

            rd: 0,
            rs: MipsModule.parseRegister(args[0], onError),
            rt: MipsModule.parseRegister(args[1], onError),
        };
    }

    function _Rjrs(name, opc, funct, args, onError) { // bastard opcodes with only rs
        return {
            name: name,
            type: 'R',
            opcode: opc,
            funct: funct,
            shift: 0,

            rd: 0,
            rs: MipsModule.parseRegister(args[0], onError),
            rt: 0
        };
    }

    function _Rjrds(name, opc, funct, args, onError) { // bastard opcodes with no rt
        return {
            name: name,
            type: 'R',
            opcode: opc,
            funct: funct,
            shift: 0,

            rd: MipsModule.parseRegister(args[1], onError),
            rs: MipsModule.parseRegister(args[0], onError),
            rt: 0
        };
    }

    function _Rmf(name, opc, funct, args, onError) { // bastard opcodes with only rd
        return {
            name: name,
            type: 'R',
            opcode: opc,
            funct: funct,
            shift: 0,

            rd: MipsModule.parseRegister(args[0], onError),
            rs: 0,
            rt: 0,
        };
    }

    function _Rmt(name, opc, funct, args, onError) { // bastard opcodes with only rs
        return {
            name: name,
            type: 'R',
            opcode: opc,
            funct: funct,
            shift: 0,

            rd: 0,
            rs: MipsModule.parseRegister(args[0], onError),
            rt: 0,
        };
    }

    function _BREAK() { // bastard BREAK opcode
        return {
            name: 'BREAK',
            type: 'R',
            opcode: 0,
            funct: 0b101,
            shift: 0,

            rd: 0,
            rs: 0,
            rt: 0,
        };
    }

    function _I(name, opc, args, onError) {
        let m = /^\d+\((\$[a-zA-Z0-9]+?)\)$/.exec(args[1]);

        if (m != null)
            return {
                name: name,
                type: 'I',
                opcode: opc,

                rt: MipsModule.parseRegister(args[0], onError),
                rs: MipsModule.parseRegister(m[1], onError),
                imm: +m[0],
            };

        else
            return {
                name: name,
                type: 'I',
                opcode: opc,

                rt: MipsModule.parseRegister(args[1], onError),
                rs: MipsModule.parseRegister(args[0], onError),
                imm: +args[2],
            };
    }

    function _Irt(name, opc, args, rt, onError) { // bastard I opcodes with fixed rt
        let m = /^\d+\((\$[a-zA-Z0-9]+?)\)$/.exec(args[1]);

        if (m != null)
            return {
                name: name,
                type: 'I',
                opcode: opc,

                rt: rt,
                rs: MipsModule.parseRegister(m[1], onError),
                imm: +m[0],
            };

        else
            return {
                name: name,
                type: 'I',
                opcode: opc,

                rt: rt,
                rs: MipsModule.parseRegister(args[0], onError),
                imm: +args[2],
            };
    }

    function _J(name, opc, args, onError) {
        return {
            name: name,
            type: 'J',
            opcode: opc,
            addr: MipsModule.parseJumpAddr.bind(this)(args[0], onError) >>> 0
        };
    }

    MipsModule.lines = function (thisArg) { // reference: https://opencores.org/project/plasma/opcodes
        return {
            // Miscellaneous
            PRINT: _I.bind(thisArg, 'PRINT', 0b111111),

            // Arithmetic Logic Unit
            ADD: _R.bind(thisArg, 'ADD', 0, 0x20),
            ADDI: _I.bind(thisArg, 'ADDI', 0b1000),
            ADDIU: _I.bind(thisArg, 'ADDIU', 0b1001),
            ADDU: _R.bind(thisArg, 'ADDU', 0, 0x21),

            AND: _R.bind(thisArg, 'AND', 0, 0x24),
            ANDI: _I.bind(thisArg, 'ANDI', 0b1100),

            LUI: _I.bind(thisArg, 'LUI', 0b1111),

            NOR: _R.bind(thisArg, 'NOR', 0, 0b100111),
            OR: _R.bind(thisArg, 'OR', 0, 0b100101),
            ORI: _I.bind(thisArg, 'ORI', 0b1101),

            SLT: _R.bind(thisArg, 'SLT', 0, 0b101010),
            SLTI: _I.bind(thisArg, 'SLTI', 0b001010),
            SLTIU: _I.bind(thisArg, 'SLTIU', 0b001011),
            SLTU: _R.bind(thisArg, 'SLTU', 0, 0b101011),

            SUB: _R.bind(thisArg, 'SUB', 0, 0x22),
            SUBU: _R.bind(thisArg, 'SUBU', 0, 0x23),

            XOR: _R.bind(thisArg, 'XOR', 0, 0b100110),
            XORI: _I.bind(thisArg, 'XORI', 0b1110),

            // Shifter
            SLL: _Rsh.bind(thisArg, 'SLL', 0, 0b0),
            SLLV: _R.bind(thisArg, 'SLLV', 0, 0b100),
            SRA: _Rsh.bind(thisArg, 'SRA', 0, 0b11),
            SRAV: _R.bind(thisArg, 'SRAV', 0, 0b111),
            SRL: _Rsh.bind(thisArg, 'SRL', 0, 0b10),
            SRLV: _R.bind(thisArg, 'SRLV', 0, 0b110),

            // Multiplication and Division
            DIV: _Rhl.bind(thisArg, 'DIV', 0, 0b11010),
            DIVU: _Rhl.bind(thisArg, 'DIVU', 0, 0b11011),

            MFHI: _Rmf.bind(thisArg, 'MFHI', 0, 0b10000),
            MFLO: _Rmf.bind(thisArg, 'MFLO', 0, 0b10010),
            MTHI: _Rmt.bind(thisArg, 'MTHI', 0, 0b10001),
            MTLO: _Rmt.bind(thisArg, 'MTLO', 0, 0b10011),

            MULT: _R.bind(thisArg, 'MULT', 0, 0b11000),
            MULTU: _R.bind(thisArg, 'MULT', 0, 0b11001),

            // Branching
            BEQ: _I.bind(thisArg, 'BEQ', 0b100),
            BGEZ: _Irt.bind(thisArg, 'BGEZ', 0b1, 0b1),
            BGEZAL: _Irt.bind(thisArg, 'BGEZAL', 0b10001, 0b1),
            BGTZ: _Irt.bind(thisArg, 'BGTZ', 0b111, 0),
            BLEZ: _Irt.bind(thisArg, 'BLEZ', 0b110, 0),
            BLTZ: _Irt.bind(thisArg, 'BLTZ', 0b1, 0),
            BLTZAL: _Irt.bind(thisArg, 'BLTZAL', 0b1, 0b10000),
            BNE: _I.bind(thisArg, 'BNE', 0b101),

            BREAK: _BREAK,

            J: _J.bind(thisArg, 'J', 0b10),
            JAL: _J.bind(thisArg, 'JAL', 0b11),
            JALR: _Rjrds.bind(thisArg, 'JALR', 0, 0b1001),
            JR: _Rjrs.bind(thisArg, 'JR', 0, 0b1000),
            
            // Coprocessing (do nothing, because we currently have only 1 processor >_>)
            // (also too lazy to compile into the proper R commands T_T)
            MFC0: _I.bind(thisArg, 'MFC0', 0b1000, ['$0', '$0', '$0'], function() {}),
            MTC0: _I.bind(thisArg, 'MTC0', 0b1000, ['$0', '$0', '$0'], function() {}),

            // System calls
            SYSCALL: _Rn.bind(thisArg, 'SYSCALL', 0, 0b1100),

            // Memory Access
            LB: _I.bind(thisArg, 'LB', 0b100000),
            LH: _I.bind(thisArg, 'LH', 0b100001),
            LW: _I.bind(thisArg, 'LW', 0b100011),
            LBU: _I.bind(thisArg, 'LBU', 0b100100),
            LHU: _I.bind(thisArg, 'LHU', 0b100101),
            LWU: _I.bind(thisArg, 'LWU', 0b100111), // not in the specifications, but meh
            SB: _I.bind(thisArg, 'SB', 0b101000),
            SH: _I.bind(thisArg, 'SH', 0b101001),
            SW: _I.bind(thisArg, 'SW', 0b101011),

            // Non-Standard (pattern followers)
            SBU: _I.bind(thisArg, 'SBU', 0b101100),
            SHU: _I.bind(thisArg, 'SHU', 0b101101),
            SWU: _I.bind(thisArg, 'SWU', 0b101111),
        };
    };

    MipsModule.compileLine = function (l, onError) {
        l = l.replace(/^\s+|\s+$|#.+$/g, '');

        if (l == '') return;

        let op = l.split(' ')[0].toUpperCase();
        let args = l.split(' ').slice(1).join(' ').replace(/\s+/g, '').split(',');

        if (this && typeof this._iPointer === 'number') this._iPointer += 4;
        let i = MipsModule.lines(this)[op](args, onError);

        return i;
    };

    MipsModule.encodeLine = function (l, onError) {
        let cl = MipsModule.compileLine.bind(this)(l, onError);
        return MIPS.instructions.formats[cl.type].encode(cl);
    };

    MipsModule.assembler = function () {
        let res = {
            begin: [],
            instructions: [],
            labels: {},
            _labelOffs: {},
            data: {},
            _iPointer: 0,
            _dPointer: 0,

            setSectionOffset: function (sect, offs) {
                res._labelOffs[sect] = offs * 4;
            },

            compileSection: function (sect, lines, onError) {
                if (typeof lines === 'string')
                    lines = lines.split('\n');

                this._iPointer = this._iPointer + 4 - (this._iPointer % 4);

                lines = lines.map((l) => MipsModule.compileLine.bind(res)(l, onError));
                if (sect == null) res.begin = lines;

                else {
                    res._labelOffs[sect] = this._iPointer;
                    res.labels[sect] = {
                        offset: this._iPointer,
                        instructions: lines
                    };
                    lines.forEach((i) => {
                        res.instructions.push(i);
                    });
                }

                return res;
            },

            alignData: function (align) {
                res._dPointer = Math.ceil(res._dPointer / (1 << align)) * (1 << align);
                return res;
            },

            addData: function (name, space = 4, initial) {
                res.data[name] = {
                    offset: res._dPointer,
                    initial: initial
                };
                res._dPointer += space;
                
                return res;
            },

            loadInMachine: function (machine, position = 0) {
                res.instructions.forEach((i, c) => {
                    MIPS.instructions.encode(i).copy(machine.text, position * 0x80000 + c * 4);
                });

                Object.keys(res.data).forEach((k) => {
                    let d = res.data[k];
                    d.initial.copy(machine.RAM, d.offset);
                });
            },

            assemble: function (code, onError) {
                let mode = 'TEXT';

                let lines = code.split('\n');
                let section = [];
                let sectionName = null;
                let varData = { space: 0, initial: Buffer.alloc(0) };

                let amode = 'TEXT';

                lines.forEach((l) => { // first pass (offset calculation)
                    l = l.replace(/^\s+|\s+$|#.+$/, '');
                    if (l == '') return;

                    if (l[0] === '.') {
                        let directive = l.slice(1).toUpperCase().split(' ');
                        l = l.replace(/^\s+|\s+$/, '');

                        let m = l.match(/^\.([a-zA-Z_-]+):$/);

                        if (mode === 'TEXT' && m) {
                            if (sectionName != null)
                                res.setSectionOffset(sectionName, section.length);
                                
                            sectionName = m[1];
                        }

                        else if (directive[0].toUpperCase() === 'DATA')
                            amode = 'DATA';

                        else if (directive[0].toUpperCase() === 'TEXT') 
                            amode = 'TEXT';
                    }

                    else {
                        if (amode === 'TEXT') {
                            let opmnem = l.split(' ')[0].toUpperCase();
                            let args = l.split(' ').slice(1).join('').replace(/\s+/g, '').split(',');

                            if (MipsModule.pseudoInstructions[opmnem] != null) 
                                MipsModule.pseudoInstructions[opmnem](args).forEach((i) => {
                                    section.push(i);
                                });

                            else
                                section.push(l);
                        }
                    }
                });

                if (sectionName != null)
                    res.setSectionOffset(sectionName, section.length);
                    
                section = [];

                lines.forEach((l) => {
                    l = l.replace(/^\s+|\s+$|#.+$/, '');
                    if (l == '') return;

                    if (l[0] === '.') {
                        let ln = l.slice(1).replace(/\s+$/, '');
                        let m = ln.match(/^([a-zA-Z_-]+):$/);
                        let directive = l.slice(1).split(' ');

                        if (m) {
                            res.compileSection(sectionName, section, onError);
                            section = [];
                            sectionName = m[1];
                        }

                        else if (directive[0].toUpperCase() === 'DATA')
                            mode = 'DATA';

                        else if (directive[0].toUpperCase() === 'TEXT') {
                            if (mode === 'DATA') {
                                res.addData(varData.name, varData.space, varData.initial);
                                varData = { space: 0, initial: Buffer.alloc(0) };
                            }

                            mode = 'TEXT';
                        }

                        else if (mode === 'DATA' && directive[0].toUpperCase() === 'SPACE')
                            varData.space += +directive[1];

                        else if (mode === 'DATA' && directive[0].toUpperCase() === 'ASCIIZ') {
                            try {
                                let s = JSON.parse(directive.slice(1).join(' '));

                                if (typeof s === 'string') {
                                    varData.initial = Buffer.concat([varData.initial, Buffer.from(s, 'utf-8')]);
                                    varData.space += s.length;
                                }

                                else
                                    throw new Error('If you\'re reading this, curse you for hacking the code.    ...actually, just kidding. Do what you want. It\'s open for a reason. :)');
                            }

                            catch (e) {
                                if (onError != null)
                                    onError(new Error(`Incorrect initial value found for ASCIIZ statement: '${directive.slice(1).join(' ')}'!`));
                            }
                        }

                        else if (mode === 'DATA' && directive[0].toUpperCase() === 'WORD') {
                            if (isNaN(directive[1])) {
                                if (onError != null)
                                    onError(new Error(`Non-numeric initial value found for WORD statement: '${directive[1]}'!`));
                            }

                            else {
                                let i = parseInt(directive[1]);
                                varData.space += 4;
                                let buf = new Buffer(4);
                                buf.writeInt32LE(i & 0xFFFFFFFF);
                                varData.initial = Buffer.concat([varData.initial, buf]);
                            }
                        }

                        else if (mode === 'DATA' && directive[0].toUpperCase() === 'HWORD') {
                            if (isNaN(directive[1])) {
                                if (onError != null)
                                    onError(new Error(`Non-numeric initial value found for HWORD statement: '${directive[1]}'!`));
                            }

                            else {
                                let i = parseInt(directive[1]);
                                varData.space += 2;
                                let buf = new Buffer(2);
                                buf.writeInt16LE(i & 0xFFFF);
                                varData.initial = Buffer.concat([varData.initial, buf]);
                            }
                        }

                        else if (mode === 'DATA' && directive[0].toUpperCase() === 'BYTE') {
                            if (isNaN(directive[1])) {
                                if (onError != null)
                                    onError(new Error(`Non-numeric initial value found for BYTE statement: '${directive[1]}'!`));
                            }

                            else {
                                let i = parseInt(directive[1]);
                                res.space += 1;
                                let buf = new Buffer(1);
                                buf.writeInt8(i & 0xFF);
                                varData.initial = Buffer.concat([varData.initial, buf]);
                            }
                        }

                        else if (mode === 'DATA' && directive[0].toUpperCase() === 'ALIGN') {
                            res.alignData(+directive[1]);
                        }

                        else if (onError != null)
                            onError(`Unknown, invalidly positioned, or unimplemented MIPS directive: '${directive[0].toUpperCase()}'`);
                    }

                    else {
                        if (mode === 'DATA') {
                            l = l.replace(/\s+$/, '');

                            let m = l.match(/^([a-zA-Z_-]+):$/);

                            if (m) {
                                if (varData.name != null) {
                                    res.addData(varData.name, varData.space, varData.initial);
                                    varData = { space: 0, initial: Buffer.alloc(0) };
                                }

                                varData.name = m[1];
                            }

                            else if (onError != null) {
                                onError(new Error(`Bad data statement (expected a dot-directive or a data label): '${l}'`));
                            }
                        }

                        else {
                            l = l.replace(/\s+$/, '');

                            let m = l.match(/^([a-zA-Z_-]+):$/);

                            if (m) {
                                res.compileSection(sectionName, section, onError);
                                section = [];
                                sectionName = m[1];
                            }

                            else
                                section.push(l);
                        }
                    }
                });

                res.compileSection(sectionName, section, onError);
                section = [];

                return res;
            }
        };       

        return res;
    };
};