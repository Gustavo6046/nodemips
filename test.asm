.data
    repeats:
        .space 1
        .byte 5

.text
    LBU $t0, 0($gp)
    PRINT $t0, 0
    ADD $t0, $t0, $t0
    J loop

.loop:
    BEQ $t0, $0, 8
    ADDI $t1, 10
    ADDI $t2, 1
    SUB $t0, $t0, $t2
    PRINT $t0, 0
    PRINT $t1, 0
    J loop
    J finish

.finish:
    ADDI $t1, 3
    PRINT $0, 0
    PRINT $0, 0
    PRINT $0, 0
    PRINT $t1, 0