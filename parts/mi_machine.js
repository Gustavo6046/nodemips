module.exports = function (MIPS, MipsModule) {
    MipsModule.MIPSMachine = class MIPSMachine {
        constructor(specialRegisters = {}, allocRam = 0x0FFFFFFF, allocText = 0xF053700, registers = null, autoAllocate = true, errorInstructions = false) {
            this.specialRegisters = {
                // note: in actual machines, PC is EIGHT PAST the current instruction.
                // so emulate that behavior properly for instructions that meddle with
                // it :)
                PC: specialRegisters.PC || 0,
                EPC: specialRegisters.EPC || 0,
                Cause: specialRegisters.Cause || 0,
                HI: specialRegisters.HI || 0,
                LO: specialRegisters.LO || 0,
                BVR: specialRegisters.BVR || 0
            };

            if (autoAllocate) {
                this.RAM = Buffer.alloc(allocRam);
                this.text = Buffer.alloc(allocText);
                this.errorRom = Buffer.alloc(0x1000000);
                this.stack = Buffer.alloc(0x1000000);
            }
                
            else {
                this.RAM = Buffer.alloc(0);
                this.text = Buffer.alloc(0);
                this.errorRom = Buffer.alloc(0);
                this.stack = Buffer.alloc(0);
            }
                
            this.registers = MIPS.registers.$registers(registers);
            this.ramSize = allocRam;
            this.textSize = allocText;
            this._intervalHandle = null;
            this.errorInstructions = errorInstructions;
        }

        json() {
            return JSON.stringify({
                SREG: this.specialRegisters,

                RAMV: this.RAM.toString('base64'),
                TXTV: this.text.toString('base64'),
                ERHV: this.errorRom.toString('base64'),
                STKV: this.stack.toString('base64'),

                GPRs: this.registers._internal,
                RAMC: this.ramSize,
                EIMd: this.errorInstructions
            });
        }
        
        static fromJSON(j) {
            if ((typeof j) === 'string') j = JSON.parse(j);

            let rbuf = Buffer.from(j.RAMV, 'base64');
            let tbuf = Buffer.from(j.TXTV, 'base64');
            let ebuf = Buffer.from(j.ERHV, 'base64');
            let sbuf = Buffer.from(j.STKV, 'base64');

            let machine = new MIPSMachine(j.SREG, rbuf.length, j.GPRs, false, j.EIMd);
            machine.loadRAMImage(rbuf);
            machine.loadTextImage(tbuf);
            machine.loadErrorHandlerImage(ebuf);
            machine.loadStackImage(sbuf);

            return machine;
        }

        loadRAMImage(image) {
            this.RAM = Buffer.alloc(this.ramSize); // the old one will be GC-ed... hopefully!
            image.copy(this.RAM, 0, 0);
        }

        loadTextImage(image) {
            this.text = Buffer.alloc(this.textSize); // the old one will be GC-ed... hopefully!
            image.copy(this.text, 0, 0);
        }

        loadErrorHandlerImage(image) {
            this.errorRom = Buffer.alloc(0x1000000);
            image.copy(this.errorRom, 0, 0);
        }

        loadStackImage(image) {
            this.stack = Buffer.alloc(0x1000000);
            image.copy(this.stack, 0, 0);
        }

        clock() {
            let inst;

            if (this.errorInstructions)
                inst = this.errorRom.readUInt32BE(this.specialRegisters.PC);
                
            else
                inst = this.text.readUInt32BE(this.specialRegisters.PC);

            MIPS.instructions.clock.bind(this)(inst);
        }

        start(hertz, speedMultiplier=100) {
            if (this._intervalHandle != null)
                this.stop();

            this._intervalHandle = setInterval(() => { for (let _ = 0; _ < speedMultiplier; _++) this.clock(); }, 1000 / hertz);
        }

        stop() {
            if (this._intervalHandle == null)
                return false;
                
            clearInterval(this._intervalHandle);
            this._intervalHandle = null;

            return true;
        }

        getInterruptStateBitField() {
            return 0;
        }

        visibleRAM(readAddr) {
            if (readAddr >= 0x80000000)
                return {
                    space: this.errorRom,
                    newAddr: readAddr - 0x80000000
                };

            else if (readAddr >= 0x70000000)
                return {
                    space: this.stack,
                    newAddr: readAddr - 0x70000000
                };

            else if (readAddr >= 0x10000000)
                return {
                    space: this.RAM,
                    newAddr: readAddr - 0x10000000
                };

            else if (readADdr >= 0x00400000)
                return {
                    space: this.text,
                    newAddr: readAddr - 0x00400000
                };

            else
                return {
                    space: Buffer.alloc(4).writeUInt32LE(0, 0),
                    newAddr: 0
                };
        }
    };
};