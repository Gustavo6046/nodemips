.data
    repeats:
        .space 1
        .byte 5

.text
    LA $t0, repeats
    LBU $t0, $t0

    # PRINT $t0, 0
    LI $v0, 1      # print number
    MOVE $a0, $t0
    SYSCALL
    LI $v0, 11     # print newline
    LI $a0, 0xA
    SYSCALL
    
    ADD $t0, $t0, $t0
    
    LI $t2, 1

    J loop

.loop:
    BNE $t0, $0, 2
    J finish

    LI $v0, 11     # print newline
    LI $a0, 0xA
    SYSCALL

    ADDI $t1, $t1, 10
    SUB $t0, $t0, $t2

    # PRINT $t0, 0
    LI $v0, 1      # print number
    MOVE $a0, $t0
    SYSCALL
    LI $v0, 11     # print newline
    LI $a0, 0xA
    SYSCALL

    # PRINT $t1, 0
    LI $v0, 1      # print number
    MOVE $a0, $t1
    SYSCALL
    LI $v0, 11     # print newline
    LI $a0, 0xA
    SYSCALL

    J loop

.finish:
    ADDI $t1, $t1, 3
    
    LI $v0, 11     # print newline
    LI $a0, 0xA
    SYSCALL

    LI $v0, 11     # print newline
    LI $a0, 0xA
    SYSCALL

    # PRINT $t1, 0
    LI $v0, 1      # print number
    MOVE $a0, $t1
    SYSCALL
    LI $v0, 11     # print newline
    LI $a0, 0xA
    SYSCALL

    # terminate execution
    LI $v0, 10
    SYSCALL