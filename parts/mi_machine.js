module.exports = function (MIPS, MipsModule) {
    MipsModule.MIPSMachine = class MIPSMachine {
        constructor(specialRegisters = {}, allocRam = 512000, registers = null, autoAllocate = true) {
            this.specialRegisters = {
                // note: in actual machines, PC is EIGHT PAST the current instruction.
                // so emulate that behavior properly for instructions that meddle with
                // it :)
                PC: specialRegisters.PC || 0,
                EPC: specialRegisters.EPC || 0,
                Cause: specialRegisters.Cause || 0,
                HI: specialRegisters.HI || 0,
                LO: specialRegisters.LO || 0
            };

            if (autoAllocate)
                this.RAM = Buffer.alloc(allocRam);
                
            else
                this.RAM = Buffer.alloc(0);
                
            this.registers = MIPS.registers.$registers(registers);
            this.ramSize = allocRam;
            this._intervalHandle = null;
        }

        json() {
            return JSON.stringify({
                SREG: this.specialRegisters,
                RAMV: this.RAM.toString('base64'),
                GPRs: this.registers._internal,
                RAMC: this.ramSize,
            });
        }
        
        static fromJSON(j) {
            if ((typeof j) === 'string') j = JSON.parse(j);

            let rbuf = Buffer.from(j.RAMV, 'base64');
            let machine = new MIPSMachine(j.SREG, rbuf.length, j.GPRs, false);
            machine.loadRAMImage(rbuf);

            return machine;
        }

        loadRAMImage(image) {
            this.RAM = Buffer.alloc(this.ramSize); // the old one will be GC-ed... hopefully!
            image.copy(this.RAM, 0, 0);
        }

        clock() {
            let inst = this.RAM.readUInt32BE(this.specialRegisters.PC);
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
    };
};