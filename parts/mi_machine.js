const JIMP = require('jimp');
const { Writable } = require('stream');


class HandlerSet {
    constructor(handlerMap) {
        this.handlers = new Map(Object.entries(handlerMap));
    }

    apply(emitter) {
        this.handlers.forEach((handler, name) => {
            emitter.on(name, handler.bind(emitter));
        });
    }
}

module.exports = function (MIPS, MipsModule) {
    MipsModule.MIPSMachine = class MIPSMachine extends Writable {
        constructor(specialRegisters = {}, allocRam = 0x200000, allocText = 0x1000000, registers = null, autoAllocate = true, errorInstructions = false) {
            super();

            this.specialRegisters = {
                // note: in actual machines, PC is EIGHT PAST the current instruction.
                // so emulate that behavior properly for instructions that meddle with
                // it :)
                PC: specialRegisters.PC || 0,
                EPC: specialRegisters.EPC || 0,
                Cause: specialRegisters.Cause || 0,
                HI: specialRegisters.HI || 0,
                LO: specialRegisters.LO || 0,
                BVR: specialRegisters.BVR || 0,
                Status: specialRegisters.Status != null ? specialRegisters.Status : 0xF
            };

            allocText = Math.ceil(Math.max(allocText, 0) / 0x200000) * 0x200000;
            allocRam = Math.ceil(Math.max(allocRam, 0) / 0x200000) * 0x200000;

            if (autoAllocate) {
                this.RAM = Buffer.alloc(allocRam);
                this.VRAM = Buffer.alloc(0x40000);
                this.text = Buffer.alloc(allocText); // 0x800000 bytes per program; must align as a multiple!
                this.errorRom = Buffer.alloc(0x800000);
                this.stack = Buffer.alloc(0x800000);
            }
                
            else {
                this.RAM = Buffer.alloc(0);
                this.VRAM = Buffer.alloc(0);
                this.text = Buffer.alloc(0);
                this.errorRom = Buffer.alloc(0);
                this.stack = Buffer.alloc(0);
            }
                
            this.registers = MIPS.registers.$registers(registers);
            this.ramSize = allocRam;
            this.textSize = allocText;
            this._intervalHandle = null;
            this.errorInstructions = errorInstructions;
            this.palette = Buffer.alloc(0x300); // 256 colors * 3 channels per color = 768 (0x300)
            this.stdinBuffer = Buffer.alloc(0);

            this.stopped = false;
        }

        _write(chunk, encoding, callback) {
            if (typeof chunk === 'string')
                this.stdinBuffer = Buffer.concat([this.stdinBuffer, Buffer.from(chunk, encoding)]);

            else
                this.stdinBuffer = Buffer.concat([this.stdinBuffer, chunk]);

            this.emit('stdin', typeof chunk === 'string' ? Buffer.from(chunk, encoding) : chunk);

            if (callback != null)
                callback();
        }

        getPalette(index) {
            return this.palette.readUIntBE(index * 3, 3);
        }

        _printStdout(data) {
            this.emit('stdout', data.toString());
        }

        getVGA(callback) {
            return new Promise((resolve, reject) => {
                new JIMP(320, 200, this.getPalette(0), (err, img) => {
                    if (err) reject(err);

                    try {
                        for (let i = 0; i < 0xFA00 /* 320 * 200 */; i++) {
                            img.setPixelColor(this.getPalette(this.VRAM.readUInt8LE(i)), i % 320, Math.floor(i / 320));
                        }

                        callback(img);
                        resolve(img);
                    }

                    catch (err) {
                        reject(err);
                    }
                });
            });
        }

        emitSyscall(type, a0, a1, a2, a3) {
            let argObj = {
                type: type,
                a0: a0,
                a1: a1,
                a2: a2,
                a3: a3
            };

            this.emit('pre syscall', argObj);
            this.emit('syscall ' + type, argObj);
            this.emit('post syscall', argObj);
        }

        json() {
            return JSON.stringify({
                SREG: this.specialRegisters,

                RAMV: this.RAM.toString('base64'),
                TXTV: this.text.toString('base64'),
                ERHV: this.errorRom.toString('base64'),
                STKV: this.stack.toString('base64'),
                VRAM: this.VRAM.toString('base64'),
                INPB: this.stdinBuffer.toString('base64'),
                VPAL: this.palette.toString('base64'),

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
            let vram = Buffer.from(j.VRAM, 'base64');
            let vpal = Buffer.from(j.VPAL, 'base64');
            let inpb = Buffer.from(j.INPB, 'base64');

            let machine = new MIPSMachine(j.SREG, rbuf.length, j.GPRs, false, j.EIMd);
            machine.loadRAMImage(rbuf);
            machine.loadTextImage(tbuf);
            machine.loadErrorHandlerImage(ebuf);
            machine.loadStackImage(sbuf);
            machine.loadVGAImage(vram);
            machine.loadPaletteImage(vpal);
            machine.loadStdinImage(inpb);

            return machine;
        }

        loadRAMImage(image) {
            this.RAM = Buffer.alloc(this.ramSize);
            image.copy(this.RAM);
        }

        loadVGAImage(image) {
            this.VRAM = Buffer.alloc(0x40000);
            image.copy(this.VRAM);
        }

        loadTextImage(image, align=0) {
            this.text = Buffer.alloc(this.textSize);
            image.copy(this.text, 0x800000 * align);
        }

        loadErrorHandlerImage(image) {
            this.errorRom = Buffer.alloc(0x1000000);
            image.copy(this.errorRom);
        }

        loadStackImage(image) {
            this.stack = Buffer.alloc(0x1000000);
            image.copy(this.stack);
        }

        loadPaletteImage(image) {
            this.palette = Buffer.alloc(0x300);
            image.copy(this.palette);
        }

        loadStdinImage(image) {
            this.stdinBuffer = Buffer.alloc(image.length);
            image.copy(this.stdinBuffer);
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

            this._intervalProps = { hertz: hertz, speed: speedMultiplier, paused: false };
            this._intervalHandle = setInterval(() => { for (let _ = 0; _ < speedMultiplier; _++) this.clock(); }, 1000 / hertz);
        }

        stop() {
            this.stopped = true;

            if (this._intervalHandle == null)
                return false;
                
            clearInterval(this._intervalHandle);
            this._intervalHandle = null;

            return true;
        }

        toggle() {
            if (this._intervalProps.paused) {
                this._intervalProps.paused = false;
                this._intervalHandle = setInterval(() => { for (let _ = 0; _ < this._intervalProps.speed; _++) this.clock(); }, 1000 / this._intervalProps.hertz);
            }

            else {
                clearInterval(this._intervalHandle);
                this._intervalProps.paused = true;
            }

            return this._intervalProps.paused;
        }

        getInterruptStateBitField() {
            return 0;
        }

        visibleRAM(readAddr) {
            if (readAddr === 0xFFFF0000) {
                // SPIM I/O. Todo.
                let buf = Buffer.alloc(4);
                buf.writeUInt32LE(0, 0);
                
                return {
                    space: buf,
                    newAddr: 0
                };
            }

            else if (readAddr >= 0xA0000000) {
                return {
                    space: this.VRAM,
                    newAddr: readAddr - 0xA0000000
                };
            }

            else if (readAddr >= 0x80000000)
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

            else if (readAddr >= 0x00400000)
                return {
                    space: this.text,
                    newAddr: readAddr - 0x00400000
                };

            else {
                let buf = Buffer.alloc(4);
                buf.writeUInt32LE(0, 0);
                
                return {
                    space: buf,
                    newAddr: 0
                };
            }
        }
    };

    MipsModule.defaultSyscalls = new HandlerSet({
        'syscall 1': function (argObj) { // print integer
            this._printStdout(argObj.a0);
        },

        'syscall 11': function (argObj) { // print character
            this._printStdout(String.fromCharCode(argObj.a0));
        },

        'syscall 10': function () { // terminate execution
            this.stop();
        },

        'syscall 4': function (argObj) { // print string
            let vis = this.visibleRAM(argObj.a0);
            this._printStdout(vis.space.slice(vis.space.newAddr, vis.space.newAddr + vis.space.slice(vis.space.newAddr).indexOf(0)));
        },

        'syscall 5': function () { // read integer
            let numstr = '0';
            let done = false;
            let inpData = this.stdinBuffer.toString('utf-8');

            this.stdinBuffer = Buffer.alloc(0);
            
            Array.from(inpData).some((l) => {
                if (/^[0-9]$/.match(l)) {
                    numstr += l;
                    return false;
                }
                
                else {
                    return done = true;
                }
            });
            
            if (done)
                this.registers.set(2, +numstr);

            else {
                this.toggle();

                let fn = (data) => {
                    if (!done)
                        Array.from(data.toString('utf-8')).some((l) => {
                            if (/^[0-9]$/.match(l)) {
                                numstr += l;
                                return false;
                            }
                            
                            else {
                                return done = true;
                            }
                        });

                    if (done) {
                        this.registers.set(2, +numstr);
                        this.removeListener('stdin', fn);
                        this.toggle();
                    }
                };

                this.on('stdin', fn);
            }
        },

        'syscall 8': function (argObj) { // read string
            let done = false;
            let inpData = this.stdinBuffer.toString('utf-8');
            let outAddr = argObj.a0;
            let outData = '';
            let i = 0;
            let max = argObj.a1;

            this.stdinBuffer = Buffer.alloc(0);
            
            Array.from(inpData).some((l) => {
                if (l === '\n' || l === '\x04')
                    i = max - 1;

                if (l !== '\x04')
                    outData += l;

                if (++i === max) {
                    
                    return done = true;
                }

                else
                    return false;
            });
            
            if (done) {
                outData += '\x00';

                let space = this.visibleRAM(outAddr);
                space.space.write(outData, space.newAddr);
            }

            else {
                this.toggle();

                let fn = (data) => {
                    if (!done)
                        Array.from(data.toString('utf-8')).some((l) => {
                            if (l === '\n' || l === '\x04')
                                i = max - 1;

                            if (l !== '\x04')
                                outData += l;

                            if (++i === max) {
                                
                                return done = true;
                            }

                            else
                                return false;
                        });

                    if (done) {
                        outData += '\x00';

                        let space = this.visibleRAM(outAddr);
                        space.space.write(outData, space.newAddr);
                        
                        this.removeListener('stdin', fn);
                    }
                };

                this.on('stdin', fn);
            }
        },
    });
};