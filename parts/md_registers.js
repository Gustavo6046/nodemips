module.exports = function (MIPS, MipsModule) {
    MipsModule.$registers = (words = null) => {
        if (words == null) {
            words = new Array(32).fill(0).map(() => 0);
            words[28] = 0x10000000;
            words[29] = 0x70000000;
        }

        words[0] = 0;

        return {
            _internal: words,

            set: (registerIndex, number) => {
                if (registerIndex != 0)
                    words[registerIndex] = number & 0xFFFFFFFF;
            },
            
            get: (registerIndex) => {
                if (registerIndex == 0)
                    return 0;
                
                return words[registerIndex];
            }
        };
    };
};