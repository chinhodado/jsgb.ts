///<reference path="toolbox.ts"/>
///<reference path="jsgb.memory.ts"/>
///<reference path="jsgb.gameboy.ts"/>
/*
 * jsgb.cpu.js v0.021 - GB CPU Emulator for JSGB, a JavaScript GameBoy Emulator
 * Copyright (C) 2009 Pedro Ladaria <Sonic1980 at Gmail dot com>
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * version 2 as published by the Free Software Foundation.
 * The full license is available at http://www.gnu.org/licenses/gpl.html
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 */

class CPU {
    gbEnableCallerStack = false;

    // CPU Registers
    RA = 0; // Accumulator
    FZ = 0; // bit 7 - Zero
    FN = 0; // bit 6 - Sub
    FH = 0; // bit 5 - Half Carry
    FC = 0; // bit 4 - Carry
    RB = 0; // Register B
    RC = 0; // Register C
    RD = 0; // Register D
    RE = 0; // Register E
    HL = 0; // Registers H and L
    SP = 0; // Stack Pointer
    PC = 0; // Program Counter
    T1 = 0; // Temp Register 1
    T2 = 0; // Temp Register 2

    gbHalt = false;
    gbPause = true;
    gbIME = true;
    gbCPUTicks = 0;
    gbDAATable: number[] = [];
    gbCallerStack = [];

    // OpCode Arrays
    OP = []; OPCB = []; // Opcode Array
    MN = []; MNCB = []; // Mnemonics

    constructor() {
        for (var i = 0; i <= 0xFF; i++) {
            this.MN[i] = () => { return 'DB 0x' + hex2(MEMR(this.PC)) + '; unknown'; };
            this.OPCB[i] = () => { };
            this.MNCB[i] = () => { return 'DW 0xCB' + hex2(MEMR(this.PC + 1)); };
        }

        this.initializeOP();
        this.initializeOPCB();
        this.initializeMN();
        this.initializeMNCB();
    }

    gb_Save_Caller(): void {
        if (this.gbEnableCallerStack) {
            this.gbCallerStack.unshift(this.PC - 1);
            if (this.gbCallerStack.length > 8) this.gbCallerStack.pop();
        }
    }

    gb_Dump_Caller_Stack(): string {
        if (this.gbEnableCallerStack) {
            var s = 'Caller Stack:\n';
            for (var i in this.gbCallerStack) {
                s += '0x' + hex4(this.gbCallerStack[i]) + '\n';
            }
            return s;
        } else {
            return 'Caller stack disabled.\n' +
                'To enable set gbEnableCallerStack=true in jsgb.cpu.ts';
        }
    }

    gb_CPU_UNK() {
        gb_Pause();
        alert(
            'Unknown opcode: ' +
            'PC = ' + hex(this.PC) + ' - ' +
            'OP = 0x' + hex(MEMR(this.PC)) + '\n\n' +
            this.gb_Dump_Caller_Stack()
            );
    }
    gb_CPU_RL(n: number): number {
        this.T1 = this.FC;
        this.FC = (n >> 7) & 1;
        n = ((n << 1) & 0xFF) | this.T1;
        this.FN = this.FH = 0;
        this.FZ = (n == 0) ? 1 : 0;
        this.gbCPUTicks = 8;
        return n;
    }
    gb_CPU_RLC(n: number): number {
        this.FC = (n >> 7) & 1;
        n = ((n << 1) & 0xFF) | this.FC;
        this.FN = this.FH = 0;
        this.FZ = (n == 0) ? 1 : 0;
        this.gbCPUTicks = 8;
        return n;
    }
    gb_CPU_RR(n: number): number {
        this.T1 = this.FC;
        this.FC = n & 1;
        n = (n >> 1) | (this.T1 << 7);
        this.FN = this.FH = 0;
        this.FZ = (n == 0) ? 1 : 0;
        this.gbCPUTicks = 8;
        return n;
    }
    gb_CPU_RRC(n: number): number {
        this.FC = n & 1;
        n = (n >> 1) | (this.FC << 7);
        this.FN = this.FH = 0;
        this.FZ = (n == 0) ? 1 : 0;
        this.gbCPUTicks = 8;
        return n;
    }
    gb_CPU_SWAP(R: string) {
        if (R == 'H') {
            this.HL = ((this.HL & 0x0F00) << 4) | ((this.HL & 0xF000) >> 4) | (this.HL & 0x00FF);
            this.gbCPUTicks = 8;
        } else if (R == 'L') {
            this.HL = ((this.HL & 0x000F) << 4) | ((this.HL & 0x00F0) >> 4) | (this.HL & 0xFF00);
            this.gbCPUTicks = 8;
        } else if (R == '(HL)') {
            this.T1 = MEMR(this.HL);
            MEMW(this.HL,((this.T1 << 4) | (this.T1 >> 4)) & 0xFF);
            this.gbCPUTicks = 8;
        } else {
            this[R] = ((this[R] << 4) | (this[R] >> 4)) & 0xFF;
            this.gbCPUTicks = 8;
        }
    }
    gb_CPU_ADD_A(R: string, C: number): void {
        this.FH = ((this.RA & 0x0F) + (this[R] & 0x0F)) > 0x0F ? 1 : 0;
        this.FC = ((this.RA & 0xFF) + (this[R] & 0xFF)) > 0xFF ? 1 : 0;
        this.RA = (this.RA + this[R]) & 0xFF;
        this.FZ = (this.RA == 0) ? 1 : 0;
        this.FN = 0;
        this.gbCPUTicks = C;
    }
    gb_CPU_ADC_A(R: string, C: number): void {
        this.T2 = this.FC;
        this.FH = ((this.RA & 0x0F) + (this[R] & 0x0F) + this.T2) > 0x0F ? 1 : 0;
        this.FC = ((this.RA & 0xFF) + (this[R] & 0xFF) + this.T2) > 0xFF ? 1 : 0;
        this.RA = (this.RA + this[R] + this.T2) & 0xFF;
        this.FZ = (this.RA == 0) ? 1 : 0;
        this.FN = 0;
        this.gbCPUTicks = C;
    }
    gb_CPU_SUB_A(R: string, C: number): void { //!!!
        if (R == 'RA') {
            this.FH = 0;
            this.FC = 0;
            this.RA = 0;
            this.FZ = 1;
            this.FN = 1;
            this.gbCPUTicks = C;
        } else {
            this.FH = (this.RA & 0x0F) < (this[R] & 0x0F) ? 1 : 0;
            this.FC = (this.RA & 0xFF) < (this[R] & 0xFF) ? 1 : 0;
            this.RA = (this.RA - this[R]) & 0xFF;
            this.FZ = (this.RA == 0) ? 1 : 0;
            this.FN = 1;
            this.gbCPUTicks = C;
        }
    }
    gb_CPU_SBC_A(R: string, C: number): void {
        this.T2 = this.FC;
        this.FH = ((this.RA & 0x0F) < ((this[R] & 0x0F) + this.T2)) ? 1 : 0;
        this.FC = ((this.RA & 0xFF) < ((this[R] & 0xFF) + this.T2)) ? 1 : 0;
        this.RA = (this.RA - this[R] - this.T2) & 0xFF;
        this.FZ = (this.RA == 0) ? 1 : 0;
        this.FN = 1;
        this.gbCPUTicks = C;
    }
    gb_CPU_AND_A(R: number, C: number): void {
        this.RA &= R;
        this.FZ = (this.RA == 0) ? 1 : 0;
        this.FH = 1;
        this.FN = this.FC = 0;
        this.gbCPUTicks = C;
    }
    gb_CPU_OR_A(R: number, C: number): void {
        this.RA |= R;
        this.FZ = (this.RA == 0) ? 1 : 0;
        this.FN = this.FH = this.FC = 0;
        this.gbCPUTicks = C;
    }
    gb_CPU_XOR_A(R: number, C: number): void {
        this.RA ^= R;
        this.FZ = (this.RA == 0) ? 1 : 0;
        this.FN = this.FH = this.FC = 0;
        this.gbCPUTicks = C;
    }
    gb_CPU_CP_A(R: string, C: number): void {
        this.FZ = (this.RA == this[R]) ? 1 : 0;
        this.FN = 1;
        this.FC = this.RA < this[R] ? 1 : 0;
        this.FH = (this.RA & 0x0F) < (this[R] & 0x0F) ? 1 : 0;
        this.gbCPUTicks = C;
    }
    gb_CPU_INC(R: string, C: number): void { //!!!
        this[R] = (++this[R]) & 0xFF;
        this.FZ = (this[R] == 0) ? 1 : 0;
        this.FN = 0;
        this.FH = (this[R] & 0xF) == 0 ? 1 : 0;
        this.gbCPUTicks = C;
    }
    gb_CPU_DEC(R: string, C: number): void {
        this[R] = (--this[R]) & 0xFF;
        this.FZ = (this[R] == 0) ? 1 : 0;
        this.FN = 1;
        this.FH = (this[R] & 0xF) == 0xF ? 1 : 0;
        this.gbCPUTicks = C; // TODO: chin - check if this is 4 or C (originally 4)
    }
    gb_CPU_ADD16(n1: number, n2: number): number {
        this.FN = 0;
        this.FH = ((n1 & 0xFFF) + (n2 & 0xFFF)) > 0xFFF ? 1 : 0; // TODO test bit 11. Not sure on this
        n1 += n2;
        this.FC = n1 > 0xFFFF ? 1 : 0;
        n1 &= 0xFFFF;
        this.gbCPUTicks = 8;
        return n1;
    }
    gb_CPU_INC16(n: number): number {
        this.gbCPUTicks = 8;
        return (n + 1) & 0xFFFF;
    }
    gb_CPU_JR(c: boolean): void { // todo: chin - check this
        if (c) {
            this.PC += sb(MEMR(this.PC)) + 1;
            this.gbCPUTicks = 12;
        } else {
            this.PC++;
            this.gbCPUTicks = 8;
        }
    }
    gb_CPU_JP(c: boolean): void { // todo: chin - check this
        if (c) {
            this.PC = (MEMR(this.PC + 1) << 8) | MEMR(this.PC);
            this.gbCPUTicks = 12;
        } else {
            this.PC += 2;
            this.gbCPUTicks = 12;
        }
    }
    gb_CPU_CALL(c: boolean): void { // todo : chin - check this
        if (this.gbEnableCallerStack) {
            this.gb_Save_Caller();
        }
        if (c) {
            this.PC += 2;
            MEMW(--this.SP, this.PC >> 8);
            MEMW(--this.SP, this.PC & 0xFF);
            this.PC = (MEMR(this.PC - 1) << 8) | MEMR(this.PC - 2);
            this.gbCPUTicks = 12;
        } else {
            this.PC += 2;
            this.gbCPUTicks = 12;
        }
    }
    gb_CPU_RST(a: number): void {
        MEMW(--this.SP, this.PC >> 8);
        MEMW(--this.SP, this.PC & 0xFF);
        this.PC = a;
        this.gbCPUTicks = 32;
    }
    gb_CPU_RET(c: boolean): void { //!!!
        if (c) {
            this.PC = (MEMR(this.SP + 1) << 8) | MEMR(this.SP);
            this.SP += 2;
            this.gbCPUTicks = 8;
        } else {
            this.gbCPUTicks = 8;
        }
    }
    gb_CPU_DDA(): void { //!!!
        this.T1 = this.RA;
        if (this.FC) this.T1 |= 256;
        if (this.FH) this.T1 |= 512;
        if (this.FN) this.T1 |= 1024;
        this.T1 = this.gbDAATable[this.T1];
        this.RA = this.T1 >> 8;
        this.FZ = (this.T1 >> 7) & 1;
        this.FN = (this.T1 >> 6) & 1;
        this.FH = (this.T1 >> 5) & 1;
        this.FC = (this.T1 >> 4) & 1;
        this.gbCPUTicks = 4;
    }
    gb_CPU_RLA(): void { //!!!
        this.T1 = this.FC;
        this.FC = (this.RA >> 7) & 1;
        this.RA = ((this.RA << 1) & 0xFF) | this.T1;
        this.FN = this.FH = 0;
        this.FZ = (this.RA == 0) ? 1 : 0; // TODO not sure. on z80 Z is not affected
        this.gbCPUTicks = 4;
    }
    gb_CPU_HALT(): void {
        if (this.gbIME) this.gbHalt = true;
        else {
            gb_Pause();
            alert('HALT instruction with interrupts disabled.');
        }
        this.gbCPUTicks = 4;
    }
    gb_LD_MEM_R16(R: string, C: number): void {
        this.T1 = (MEMR(this.PC + 1) << 8) + MEMR(this.PC);
        MEMW(this.T1++, this[R] & 0xFF);
        MEMW(this.T1, this[R] >> 8);
        this.PC += 2;
        this.gbCPUTicks = C;
    }
    gb_CPU_SLA_R(R: string, C: number): void {
        this.FC = (this[R] >> 7) & 1;
        this[R] = (this[R] << 1) & 0xFF;
        this.FN = this.FH = 0;
        this.FZ = (this[R] == 0) ? 1 : 0;
        this.gbCPUTicks = C;
    }
    gb_CPU_NOP(): void {
        this.gbCPUTicks = 0;
    }

    initializeOP() {
        this.OP[0x00] = this.gb_CPU_NOP; // NOP
        this.OP[0x01] = () => {
            this.RC = MEMR(this.PC++);
            this.RB = MEMR(this.PC++);
            this.gbCPUTicks = 12;
        }; // LD BC,u16
        this.OP[0x02] = () => {
            MEMW((this.RB << 8) | this.RC, this.RA);
            this.gbCPUTicks = 8;
        }; // LD (BC),A
        this.OP[0x03] = () => {
            this.T1 = this.gb_CPU_INC16((this.RB << 8) | this.RC);
            this.RB = this.T1 >> 8;
            this.RC = this.T1 & 0xFF;
        }; // INC BC
        this.OP[0x04] = () => { this.gb_CPU_INC('RB', 4); }; // INC B
        this.OP[0x05] = () => { this.gb_CPU_DEC('RB', 4); }; // DEC B
        this.OP[0x06] = () => {
            this.RB = MEMR(this.PC++);
            this.gbCPUTicks = 8;
        }; // LD B,u8
        this.OP[0x07] = () => {
            this.FC = (this.RA >> 7) & 1;
            this.RA = ((this.RA << 1) & 0xFF) | this.FC;
            this.FN = this.FH = 0;
            this.FZ = this.RA == 0 ? 1 : 0;
            this.gbCPUTicks = 4;
        }; // RLCA
        this.OP[0x08] = () => { this.gb_LD_MEM_R16('HL', 20); }; // LD (u16),SP
        this.OP[0x09] = () => {
            this.HL = this.gb_CPU_ADD16(this.HL,(this.RB << 8) | this.RC);
        }; // ADD HL,BC
        this.OP[0x0A] = () => {
            this.RA = MEMR(((this.RB & 0x00FF) << 8) | this.RC);
            this.gbCPUTicks = 8;
        }; // LD A,(BC)
        this.OP[0x0B] = () => {
            var BC = ((this.RB << 8) + this.RC - 1) & 0xFFFF;
            this.RB = BC >> 8;
            this.RC = BC & 0xFF;
            this.gbCPUTicks = 8;
        }; // DEC BC
        this.OP[0x0C] = () => { this.gb_CPU_INC('RC', 4); }; // INC C
        this.OP[0x0D] = () => { this.gb_CPU_DEC('RC', 4); }; // DEC C
        this.OP[0x0E] = () => {
            this.RC = MEMR(this.PC++);
            this.gbCPUTicks = 8;
        }; // LD C,u8;
        this.OP[0x0F] = () => {
            this.FC = this.RA & 1;
            this.RA = (this.RA >> 1) | (this.FC << 7);
            this.FN = 0;
            this.FH = 0;
            this.FZ = this.RA == 0 ? 1 : 0;
            this.gbCPUTicks = 4;
        }; // RRCA
        this.OP[0x10] = () => {
            gb_Pause();
            alert('STOP instruction\n' + this.gb_Dump_Caller_Stack());
            this.gbCPUTicks = 4;
        }; // STOP
        this.OP[0x11] = () => {
            this.RE = MEMR(this.PC++);
            this.RD = MEMR(this.PC++);
            this.gbCPUTicks = 12;
        }; // LD DE,u16
        this.OP[0x12] = () => {
            MEMW((this.RD << 8) | this.RE, this.RA);
            this.gbCPUTicks = 8;
        }; // LD (DE),A
        this.OP[0x13] = () => {
            this.T1 = this.gb_CPU_INC16((this.RD << 8) | this.RE);
            this.RD = this.T1 >> 8;
            this.RE = this.T1 & 0xFF;
        }; // INC DE
        this.OP[0x14] = () => { this.gb_CPU_INC('RD', 4); }; // INC D
        this.OP[0x15] = () => { this.gb_CPU_DEC('RD', 4); }; // DEC D
        this.OP[0x16] = () => {
            this.RD = MEMR(this.PC++);
            this.gbCPUTicks = 8;
        }; // LD D,u8
        this.OP[0x17] = () => { this.gb_CPU_RLA(); }; // RLA
        this.OP[0x18] = () => { this.gb_CPU_JR(true); }; // JR s8
        this.OP[0x19] = () => { this.HL = this.gb_CPU_ADD16(this.HL,(this.RD << 8) | this.RE); }; // ADD HL,DE
        this.OP[0x1A] = () => {
            this.RA = MEMR(((this.RD & 0x00FF) << 8) | this.RE);
            this.gbCPUTicks = 8;
        }; // LD A,(DE)
        this.OP[0x1B] = () => {
            var DE = ((this.RD << 8) + this.RE - 1) & 0xFFFF;
            this.RD = DE >> 8;
            this.RE = DE & 0xFF;
            this.gbCPUTicks = 8;
        }; // DEC DE
        this.OP[0x1C] = () => { this.gb_CPU_INC('RE', 4); }; // INC E
        this.OP[0x1D] = () => { this.gb_CPU_DEC('RE', 4); }; // DEC E
        this.OP[0x1E] = () => {
            this.RE = MEMR(this.PC++);
            this.gbCPUTicks = 8;
        }; // LD E,u8;
        this.OP[0x1F] = () => {
            this.T1 = this.FC;
            this.FC = this.RA & 1;
            this.RA = (this.RA >> 1) | (this.T1 << 7);
            this.FN = 0;
            this.FH = 0;
            this.FZ = this.RA == 0 ? 1 : 0;
            this.gbCPUTicks = 4;
        }; // RRA
        this.OP[0x20] = () => { this.gb_CPU_JR(!this.FZ); }; // JR NZ,s8
        this.OP[0x21] = () => {
            this.HL = (MEMR(this.PC + 1) << 8) | MEMR(this.PC);
            this.PC += 2;
            this.gbCPUTicks = 12;
        }; // LD HL,u16;
        this.OP[0x22] = () => {
            MEMW(this.HL, this.RA);
            this.HL = (++this.HL) & 0xFFFF;
            this.gbCPUTicks = 8;
        }; // LDI (HL),A
        this.OP[0x23] = () => { this.HL = this.gb_CPU_INC16(this.HL); }; // INC HL
        this.OP[0x24] = () => {
            this.T1 = this.HL >> 8;
            this.gb_CPU_INC('T1', 4);
            this.HL = (this.HL & 0x00FF) | (this.T1 << 8);
        }; // INC H
        this.OP[0x25] = () => {
            this.T1 = this.HL >> 8;
            this.gb_CPU_DEC('T1', 4);
            this.HL = (this.HL & 0x00FF) | (this.T1 << 8);
        }; // DEC H
        this.OP[0x26] = () => {
            this.HL &= 0x00FF; this.HL |= MEMR(this.PC++) << 8;
            this.gbCPUTicks = 8;
        }; // LD H,u8
        this.OP[0x27] = () => { this.gb_CPU_DDA(); }; // DAA
        this.OP[0x28] = () => { this.gb_CPU_JR(this.FZ != 0); }; // JR Z,s8
        this.OP[0x29] = () => { this.HL = this.gb_CPU_ADD16(this.HL, this.HL); }; // ADD HL,HL
        this.OP[0x2A] = () => {
            this.RA = MEMR(this.HL);
            this.HL = (this.HL + 1) & 0xFFFF;
            this.gbCPUTicks = 8;
        }; // LDI A,(HL)
        this.OP[0x2B] = () => { this.HL = (this.HL - 1) & 0xFFFF; this.gbCPUTicks = 8; }; // DEC HL
        this.OP[0x2C] = () => {
            this.T1 = this.HL & 0xFF;
            this.gb_CPU_INC('T1', 4);
            this.HL = (this.HL & 0xFF00) | this.T1;
        }; // INC L
        this.OP[0x2D] = () => {
            this.T1 = this.HL & 0xFF;
            this.gb_CPU_DEC('T1', 4);
            this.HL = (this.HL & 0xFF00) | this.T1;
        }; // DEC L
        this.OP[0x2E] = () => { this.HL &= 0xFF00; this.HL |= MEMR(this.PC++); this.gbCPUTicks = 8; }; // LD L,u8
        this.OP[0x2F] = () => { this.RA ^= 0xFF; this.FN = 1; this.FH = 1; this.gbCPUTicks = 4; }; // CPL
        this.OP[0x30] = () => { this.gb_CPU_JR(!this.FC); }; // JR NC,s8
        this.OP[0x31] = () => {
            this.SP = (MEMR(this.PC + 1) << 8) | MEMR(this.PC);
            this.PC += 2;
            this.gbCPUTicks = 12;
        }; // LD SP,u16
        this.OP[0x32] = () => {
            MEMW(this.HL, this.RA);
            this.HL = (this.HL - 1) & 0xFFFF;
            this.gbCPUTicks = 8;
        }; // LDD (HL),A
        this.OP[0x33] = () => { this.SP = this.gb_CPU_INC16(this.SP); }; // INC SP
        this.OP[0x34] = () => {
            this.T1 = MEMR(this.HL);
            this.gb_CPU_INC('T1', 12);
            MEMW(this.HL, this.T1);
        }; // INC (HL)
        this.OP[0x35] = () => {
            this.T1 = MEMR(this.HL);
            this.gb_CPU_DEC('T1', 12);
            MEMW(this.HL, this.T1);
        }; // DEC (HL)
        this.OP[0x36] = () => { MEMW(this.HL, MEMR(this.PC++)); this.gbCPUTicks = 12; }; // LD (HL),u8;
        this.OP[0x37] = () => { this.FC = 1; this.FN = 0; this.FH = 0; this.gbCPUTicks = 4; }; // SCF
        this.OP[0x38] = () => { this.gb_CPU_JR(this.FC != 0); }; // JR C,s8
        this.OP[0x39] = () => { this.HL = this.gb_CPU_ADD16(this.HL, this.SP); }; // ADD HL,SP
        this.OP[0x3A] = () => {
            this.RA = MEMR(this.HL);
            this.HL = (this.HL - 1) & 0xFFFF;
            this.gbCPUTicks = 8;
        }; // LDD A,(HL)
        this.OP[0x3B] = () => { this.SP = (this.SP - 1) & 0xFFFF; this.gbCPUTicks = 8; }; // DEC SP
        this.OP[0x3C] = () => { this.gb_CPU_INC('RA', 4); }; // INC A
        this.OP[0x3D] = () => { this.gb_CPU_DEC('RA', 4); }; // DEC A
        this.OP[0x3E] = () => { this.RA = MEMR(this.PC++); this.gbCPUTicks = 8; }; // LD A,u8;
        this.OP[0x3F] = () => { this.FC = (~this.FC) & 1; this.FN = this.FH = 0; this.gbCPUTicks = 4; }; // CCF
        this.OP[0x40] = this.gb_CPU_NOP; // LD B,B
        this.OP[0x41] = () => { this.RB = this.RC; this.gbCPUTicks = 4; }; // LD B,C
        this.OP[0x42] = () => { this.RB = this.RD; this.gbCPUTicks = 4; }; // LD B,D
        this.OP[0x43] = () => { this.RB = this.RE; this.gbCPUTicks = 4; }; // LD B,E
        this.OP[0x44] = () => { this.RB = this.HL >> 8; this.gbCPUTicks = 4; }; // LD B,H
        this.OP[0x45] = () => { this.RB = this.HL & 0xFF; this.gbCPUTicks = 4; }; // LD B,L
        this.OP[0x46] = () => { this.RB = MEMR(this.HL); this.gbCPUTicks = 8; }; // LD B,(HL)
        this.OP[0x47] = () => { this.RB = this.RA; this.gbCPUTicks = 4; }; // LD B,A
        this.OP[0x48] = () => { this.RC = this.RB; this.gbCPUTicks = 4; }; // LD C,B
        this.OP[0x49] = this.gb_CPU_NOP; // LD C,C
        this.OP[0x4A] = () => { this.RC = this.RD; this.gbCPUTicks = 4; }; // LD C,D
        this.OP[0x4B] = () => { this.RC = this.RE; this.gbCPUTicks = 4; }; // LD C,E
        this.OP[0x4C] = () => { this.RC = this.HL >> 8; this.gbCPUTicks = 4; }; // LD C,H
        this.OP[0x4D] = () => { this.RC = this.HL & 0xFF; this.gbCPUTicks = 4; }; // LD C,L
        this.OP[0x4E] = () => { this.RC = MEMR(this.HL); this.gbCPUTicks = 8; }; // LD C,(HL)
        this.OP[0x4F] = () => { this.RC = this.RA; this.gbCPUTicks = 4; }; // LD C,A
        this.OP[0x50] = () => { this.RD = this.RB; this.gbCPUTicks = 4; }; // LD D,B
        this.OP[0x51] = () => { this.RD = this.RC; this.gbCPUTicks = 4; }; // LD D,C
        this.OP[0x52] = this.gb_CPU_NOP; // LD D,D
        this.OP[0x53] = () => { this.RD = this.RE; this.gbCPUTicks = 4; }; // LD D,E
        this.OP[0x54] = () => { this.RD = this.HL >> 8; this.gbCPUTicks = 4; }; // LD D,H
        this.OP[0x55] = () => { this.RD = this.HL & 0xFF; this.gbCPUTicks = 4; }; // LD D,L
        this.OP[0x56] = () => { this.RD = MEMR(this.HL); this.gbCPUTicks = 8; }; // LD D,(HL)
        this.OP[0x57] = () => { this.RD = this.RA; this.gbCPUTicks = 4; }; // LD D,A
        this.OP[0x58] = () => { this.RE = this.RB; this.gbCPUTicks = 4; }; // LD E,B
        this.OP[0x59] = () => { this.RE = this.RC; this.gbCPUTicks = 4; }; // LD E,C
        this.OP[0x5A] = () => { this.RE = this.RD; this.gbCPUTicks = 4; }; // LD E,D
        this.OP[0x5B] = this.gb_CPU_NOP; // LD E,E
        this.OP[0x5C] = () => { this.RE = this.HL >> 8; this.gbCPUTicks = 4; }; // LD E,H
        this.OP[0x5D] = () => { this.RE = this.HL & 0xFF; this.gbCPUTicks = 4; }; // LD E,L
        this.OP[0x5E] = () => { this.RE = MEMR(this.HL); this.gbCPUTicks = 8; }; // LD E,(HL)
        this.OP[0x5F] = () => { this.RE = this.RA; this.gbCPUTicks = 4; }; // LD E,A
        this.OP[0x60] = () => { this.HL = (this.HL & 0x00FF) | (this.RB << 8); this.gbCPUTicks = 4; }; // LD H,B
        this.OP[0x61] = () => { this.HL = (this.HL & 0x00FF) | (this.RC << 8); this.gbCPUTicks = 4; }; // LD H,C
        this.OP[0x62] = () => { this.HL = (this.HL & 0x00FF) | (this.RD << 8); this.gbCPUTicks = 4; }; // LD H,D
        this.OP[0x63] = () => { this.HL = (this.HL & 0x00FF) | (this.RE << 8); this.gbCPUTicks = 4; }; // LD H,E
        this.OP[0x64] = this.gb_CPU_NOP; // LD H,H
        this.OP[0x65] = () => { this.HL = (this.HL & 0x00FF) | ((this.HL & 0xFF) << 8); this.gbCPUTicks = 4; }; // LD H,L
        this.OP[0x66] = () => { this.HL = (this.HL & 0x00FF) | (MEMR(this.HL) << 8); this.gbCPUTicks = 8; }; // LD H,(HL)
        this.OP[0x67] = () => { this.HL = (this.RA << 8) | (this.HL & 0xFF); this.gbCPUTicks = 4; }; // LD H,A
        this.OP[0x68] = () => { this.HL = (this.HL & 0xFF00) | this.RB; this.gbCPUTicks = 4; }; // LD L,B
        this.OP[0x69] = () => { this.HL = (this.HL & 0xFF00) | this.RC; this.gbCPUTicks = 4; }; // LD L,C
        this.OP[0x6A] = () => { this.HL = (this.HL & 0xFF00) | this.RD; this.gbCPUTicks = 4; }; // LD L,D
        this.OP[0x6B] = () => { this.HL = (this.HL & 0xFF00) | this.RE; this.gbCPUTicks = 4; }; // LD L,E
        this.OP[0x6C] = () => { this.HL = (this.HL & 0xFF00) | (this.HL >> 8); this.gbCPUTicks = 4; }; // LD L,H
        this.OP[0x6D] = this.gb_CPU_NOP; // LD L,L
        this.OP[0x6E] = () => { this.HL = (this.HL & 0xFF00) | (MEMR(this.HL)); this.gbCPUTicks = 8; }; // LD L,(HL)
        this.OP[0x6F] = () => { this.HL = this.RA | (this.HL & 0xFF00); this.gbCPUTicks = 4; }; // LD L,A
        this.OP[0x70] = () => { MEMW(this.HL, this.RB); this.gbCPUTicks = 8; }; // LD (HL),B
        this.OP[0x71] = () => { MEMW(this.HL, this.RC); this.gbCPUTicks = 8; }; // LD (HL),C
        this.OP[0x72] = () => { MEMW(this.HL, this.RD); this.gbCPUTicks = 8; }; // LD (HL),D
        this.OP[0x73] = () => { MEMW(this.HL, this.RE); this.gbCPUTicks = 8; }; // LD (HL),E
        this.OP[0x74] = () => { MEMW(this.HL, this.HL >> 8); this.gbCPUTicks = 8; }; // LD (HL),H
        this.OP[0x75] = () => { MEMW(this.HL, this.HL & 0x00FF); this.gbCPUTicks = 8; }; // LD (HL),L
        this.OP[0x76] = () => { this.gb_CPU_HALT(); }; // HALT
        this.OP[0x77] = () => { MEMW(this.HL, this.RA); this.gbCPUTicks = 8; }; // LD (HL),A
        this.OP[0x78] = () => { this.RA = this.RB; this.gbCPUTicks = 4; }; // LD A,B
        this.OP[0x79] = () => { this.RA = this.RC; this.gbCPUTicks = 4; }; // LD A,C
        this.OP[0x7A] = () => { this.RA = this.RD; this.gbCPUTicks = 4; }; // LD A,D
        this.OP[0x7B] = () => { this.RA = this.RE; this.gbCPUTicks = 4; }; // LD A,E
        this.OP[0x7C] = () => { this.RA = this.HL >> 8; this.gbCPUTicks = 4; }; // LD A,H
        this.OP[0x7D] = () => { this.RA = this.HL & 0xFF; this.gbCPUTicks = 4; }; // LD A,L
        this.OP[0x7E] = () => { this.RA = MEMR(this.HL); this.gbCPUTicks = 8; }; // LD A,(HL)
        this.OP[0x7F] = this.gb_CPU_NOP; // LD A,A
        this.OP[0x80] = () => { this.gb_CPU_ADD_A('RB', 4); }; // ADD A,B
        this.OP[0x81] = () => { this.gb_CPU_ADD_A('RC', 4); }; // ADD A,C
        this.OP[0x82] = () => { this.gb_CPU_ADD_A('RD', 4); }; // ADD A,D
        this.OP[0x83] = () => { this.gb_CPU_ADD_A('RE', 4); }; // ADD A,E
        this.OP[0x84] = () => { this.T1 = this.HL >> 8; this.gb_CPU_ADD_A('T1', 4); }; // ADD A,H
        this.OP[0x85] = () => { this.T1 = this.HL & 0xFF; this.gb_CPU_ADD_A('T1', 4); }; // ADD A,L
        this.OP[0x86] = () => { this.T1 = MEMR(this.HL); this.gb_CPU_ADD_A('T1', 8); }; // ADD A,(HL)
        this.OP[0x87] = () => { this.gb_CPU_ADD_A('RA', 4); }; // ADD A,A
        this.OP[0x88] = () => { this.gb_CPU_ADC_A('RB', 4); }; // ADC A,B
        this.OP[0x89] = () => { this.gb_CPU_ADC_A('RC', 4); }; // ADC A,C
        this.OP[0x8A] = () => { this.gb_CPU_ADC_A('RD', 4); }; // ADC A,D
        this.OP[0x8B] = () => { this.gb_CPU_ADC_A('RE', 4); }; // ADC A,E
        this.OP[0x8C] = () => { this.T1 = this.HL >> 8; this.gb_CPU_ADC_A('T1', 4); }; // ADC A,H
        this.OP[0x8D] = () => { this.T1 = this.HL & 0xFF; this.gb_CPU_ADC_A('T1', 4); }; // ADC A,L
        this.OP[0x8E] = () => { this.T1 = MEMR(this.HL); this.gb_CPU_ADC_A('T1', 8); }; // ADC A,(HL)
        this.OP[0x8F] = () => { this.gb_CPU_ADC_A('RA', 4); }; // ADC A,A
        this.OP[0x90] = () => { this.gb_CPU_SUB_A('RB', 4); }; // SUB B
        this.OP[0x91] = () => { this.gb_CPU_SUB_A('RC', 4); }; // SUB C
        this.OP[0x92] = () => { this.gb_CPU_SUB_A('RD', 4); }; // SUB D
        this.OP[0x93] = () => { this.gb_CPU_SUB_A('RE', 4); }; // SUB E
        this.OP[0x94] = () => { this.T1 = this.HL >> 8; this.gb_CPU_SUB_A('T1', 4); }; // SUB H
        this.OP[0x95] = () => { this.T1 = this.HL & 0xFF; this.gb_CPU_SUB_A('T1', 4); }; // SUB L
        this.OP[0x96] = () => { this.T1 = MEMR(this.HL); this.gb_CPU_SUB_A('T1', 8); }; // SUB (HL)
        this.OP[0x97] = () => { this.gb_CPU_SUB_A('RA', 4); }; // SUB A
        this.OP[0x98] = () => { this.gb_CPU_SBC_A('RB', 4); }; // SBC A,B
        this.OP[0x99] = () => { this.gb_CPU_SBC_A('RC', 4); }; // SBC A,C
        this.OP[0x9A] = () => { this.gb_CPU_SBC_A('RD', 4); }; // SBC A,D
        this.OP[0x9B] = () => { this.gb_CPU_SBC_A('RE', 4); }; // SBC A,E
        this.OP[0x9C] = () => { this.T1 = this.HL >> 8; this.gb_CPU_SBC_A('T1', 4); }; // SBC A,H
        this.OP[0x9D] = () => { this.T1 = this.HL & 0xFF; this.gb_CPU_SBC_A('T1', 4); }; // SBC A,L
        this.OP[0x9E] = () => { this.T1 = MEMR(this.HL); this.gb_CPU_SBC_A('T1', 8); }; // SBC A,(HL)
        this.OP[0x9F] = () => { this.gb_CPU_SBC_A('RA', 4); }; // SBC A,A
        this.OP[0xA0] = () => { this.gb_CPU_AND_A(this.RB, 4); }; // AND B
        this.OP[0xA1] = () => { this.gb_CPU_AND_A(this.RC, 4); }; // AND C
        this.OP[0xA2] = () => { this.gb_CPU_AND_A(this.RD, 4); }; // AND D
        this.OP[0xA3] = () => { this.gb_CPU_AND_A(this.RE, 4); }; // AND E
        this.OP[0xA4] = () => { this.gb_CPU_AND_A(this.HL >> 8, 4); }; // AND H
        this.OP[0xA5] = () => { this.gb_CPU_AND_A(this.HL & 0xFF, 4); }; // AND L
        this.OP[0xA6] = () => { this.gb_CPU_AND_A(MEMR(this.HL), 8); }; // AND (HL)
        this.OP[0xA7] = () => {
            this.FZ = (this.RA == 0) ? 1 : 0;
            this.FH = 1;
            this.FN = this.FC = 0;
            this.gbCPUTicks = 4;
        }; // AND A
        this.OP[0xA8] = () => { this.gb_CPU_XOR_A(this.RB, 4); }; // XOR B
        this.OP[0xA9] = () => { this.gb_CPU_XOR_A(this.RC, 4); }; // XOR C
        this.OP[0xAA] = () => { this.gb_CPU_XOR_A(this.RD, 4); }; // XOR D
        this.OP[0xAB] = () => { this.gb_CPU_XOR_A(this.RE, 4); }; // XOR E
        this.OP[0xAC] = () => { this.gb_CPU_XOR_A(this.HL >> 8, 4); }; // XOR H
        this.OP[0xAD] = () => { this.gb_CPU_XOR_A(this.HL & 0xFF, 4); }; // XOR L
        this.OP[0xAE] = () => { this.gb_CPU_XOR_A(MEMR(this.HL), 8); }; // XOR (HL)
        this.OP[0xAF] = () => {
            this.RA = 0;
            this.FZ = 1;
            this.FN = this.FH = this.FC = 0;
            this.gbCPUTicks = 4;
        }; // XOR A
        this.OP[0xB0] = () => { this.gb_CPU_OR_A(this.RB, 4); }; // OR B
        this.OP[0xB1] = () => { this.gb_CPU_OR_A(this.RC, 4); }; // OR C
        this.OP[0xB2] = () => { this.gb_CPU_OR_A(this.RD, 4); }; // OR D
        this.OP[0xB3] = () => { this.gb_CPU_OR_A(this.RE, 4); }; // OR E
        this.OP[0xB4] = () => { this.gb_CPU_OR_A(this.HL >> 8, 4); }; // OR H
        this.OP[0xB5] = () => { this.gb_CPU_OR_A(this.HL & 0xFF, 4); }; // OR L
        this.OP[0xB6] = () => { this.gb_CPU_OR_A(MEMR(this.HL), 8); }; // OR (HL)
        this.OP[0xB7] = () => {
            this.FZ = (this.RA == 0) ? 1 : 0;
            this.FN = this.FH = this.FC = 0;
            this.gbCPUTicks = 4;
        }; // OR A
        this.OP[0xB8] = () => { this.gb_CPU_CP_A('RB', 4); }; // CP B
        this.OP[0xB9] = () => { this.gb_CPU_CP_A('RC', 4); }; // CP C
        this.OP[0xBA] = () => { this.gb_CPU_CP_A('RD', 4); }; // CP D
        this.OP[0xBB] = () => { this.gb_CPU_CP_A('RE', 4); }; // CP E
        this.OP[0xBC] = () => { this.T1 = this.HL >> 8; this.gb_CPU_CP_A('T1', 4); }; // CP H
        this.OP[0xBD] = () => { this.T1 = this.HL & 0xFF; this.gb_CPU_CP_A('T1', 4); }; // CP L
        this.OP[0xBE] = () => { this.T1 = MEMR(this.HL); this.gb_CPU_CP_A('T1', 8); }; // CP (HL)
        this.OP[0xBF] = () => { this.gb_CPU_CP_A('RA', 4); }; // CP A
        this.OP[0xC0] = () => { this.gb_CPU_RET(!this.FZ); }; // RET NZ
        this.OP[0xC1] = () => { this.RC = MEMR(this.SP++); this.RB = MEMR(this.SP++); this.gbCPUTicks = 12; }; // POP BC
        this.OP[0xC2] = () => { this.gb_CPU_JP(!this.FZ); };// JP NZ,u16
        this.OP[0xC3] = () => { this.gb_CPU_JP(true); };// JP u16;
        this.OP[0xC4] = () => { this.gb_CPU_CALL(!this.FZ); };// CALL NZ,u16
        this.OP[0xC5] = () => { MEMW(--this.SP, this.RB); MEMW(--this.SP, this.RC); this.gbCPUTicks = 16; }; // PUSH BC
        this.OP[0xC6] = () => { this.T1 = MEMR(this.PC++); this.gb_CPU_ADD_A('T1', 8); };// ADD A,u8
        this.OP[0xC7] = () => { this.gb_CPU_RST(0x00); };// RST 0x00
        this.OP[0xC8] = () => { this.gb_CPU_RET(this.FZ != 0); };// RET Z
        this.OP[0xC9] = () => { this.gb_CPU_RET(true); };// RET
        this.OP[0xCA] = () => { this.gb_CPU_JP(this.FZ != 0); };// JP Z,u16;
        this.OP[0xCB] = () => { this.OPCB[MEMR(this.PC++)](); };
        this.OP[0xCC] = () => { this.gb_CPU_CALL(this.FZ != 0); };// CALL Z,u16
        this.OP[0xCD] = () => { this.gb_CPU_CALL(true); };// CALL u16
        this.OP[0xCE] = () => { this.T1 = MEMR(this.PC++); this.gb_CPU_ADC_A('T1', 4); };// ADC A,u8;
        this.OP[0xCF] = () => { this.gb_CPU_RST(0x08); };// RST 0x08
        this.OP[0xD0] = () => { this.gb_CPU_RET(!this.FC); };// RET NC
        this.OP[0xD1] = () => { this.RE = MEMR(this.SP++); this.RD = MEMR(this.SP++); this.gbCPUTicks = 12; }; // POP DE
        this.OP[0xD2] = () => { this.gb_CPU_JP(!this.FC); };// JP NC,u16
        this.OP[0xD3] = this.gb_CPU_UNK;
        this.OP[0xD4] = () => { this.gb_CPU_CALL(!this.FC); };// CALL NC,u16
        this.OP[0xD5] = () => { MEMW(--this.SP, this.RD); MEMW(--this.SP, this.RE); this.gbCPUTicks = 16; }; // PUSH DE
        this.OP[0xD6] = () => {
            this.T1 = MEMR(this.PC++);
            this.gb_CPU_SUB_A('T1', 8);
        };// SUB u8
        this.OP[0xD7] = () => { this.gb_CPU_RST(0x10); };// RST 0x10
        this.OP[0xD8] = () => { this.gb_CPU_RET(this.FC != 0); };// RET C
        this.OP[0xD9] = () => {
            this.gb_CPU_RET(true);
            this.gbIME = true;
        };// RETI
        this.OP[0xDA] = () => { this.gb_CPU_JP(this.FC != 0); };// JP C,u16
        this.OP[0xDB] = this.gb_CPU_UNK;
        this.OP[0xDC] = () => { this.gb_CPU_CALL(this.FC != 0); };// CALL C,u16
        this.OP[0xDD] = this.gb_CPU_UNK;
        this.OP[0xDE] = () => { this.T1 = MEMR(this.PC++); this.gb_CPU_SBC_A('T1', 8); };// SBC A,u8;
        this.OP[0xDF] = () => { this.gb_CPU_RST(0x18); };// RST 0x18
        this.OP[0xE0] = () => { MEMW(0xFF00 + MEMR(this.PC++), this.RA); this.gbCPUTicks = 12; }; // LD (0xFF00+u8),A
        this.OP[0xE1] = () => {
            this.T1 = MEMR(this.SP++);
            this.HL = (MEMR(this.SP++) << 8) | this.T1;
            this.gbCPUTicks = 12;
        }; // POP HL
        this.OP[0xE2] = () => { MEMW(0xFF00 + this.RC, this.RA); this.gbCPUTicks = 8; }; // LD (0xFF00+C),A
        this.OP[0xE3] = this.gb_CPU_UNK;
        this.OP[0xE4] = this.gb_CPU_UNK;
        this.OP[0xE5] = () => {
            MEMW(--this.SP, this.HL >> 8);
            MEMW(--this.SP, this.HL & 0xFF);
            this.gbCPUTicks = 16;
        }; // PUSH HL
        this.OP[0xE6] = () => { this.gb_CPU_AND_A(MEMR(this.PC++), 8); };// AND u8
        this.OP[0xE7] = () => { this.gb_CPU_RST(0x20); };// RST 0x20
        this.OP[0xE8] = () => {
            this.SP = this.gb_CPU_ADD16(this.SP, sb(MEMR(this.PC++)));
            this.gbCPUTicks += 8;
        }; // ADD SP,u8
        this.OP[0xE9] = () => { this.PC = this.HL; this.gbCPUTicks = 4; }; // JP (HL)
        this.OP[0xEA] = () => {
            MEMW((MEMR(this.PC + 1) << 8) | MEMR(this.PC), this.RA);
            this.PC += 2;
            this.gbCPUTicks = 16;
        }; // LD (u16),A
        this.OP[0xEB] = this.gb_CPU_UNK;
        this.OP[0xEC] = this.gb_CPU_UNK;
        this.OP[0xED] = this.gb_CPU_UNK;
        this.OP[0xEE] = () => { this.gb_CPU_XOR_A(MEMR(this.PC++), 8); };// XOR u8
        this.OP[0xEF] = () => { this.gb_CPU_RST(0x28); };// RST 0x28
        this.OP[0xF0] = () => {
            this.RA = MEMR(0xFF00 + MEMR(this.PC++));
            this.gbCPUTicks = 12;
        }; // LD A,(0xFF00+u8)
        this.OP[0xF1] = () => {
            this.T1 = MEMR(this.SP++);
            this.RA = MEMR(this.SP++);
            this.FZ = (this.T1 >> 7) & 1;
            this.FN = (this.T1 >> 6) & 1;
            this.FH = (this.T1 >> 5) & 1;
            this.FC = (this.T1 >> 4) & 1;
            this.gbCPUTicks = 12;
        }; // POP AF
        this.OP[0xF2] = () => { this.RA = MEMR(0xFF00 + this.RC); this.gbCPUTicks = 8; }; // LD A,(0xFF00+C)
        this.OP[0xF3] = () => { this.gbIME = false; this.gbCPUTicks = 4; }; // DI
        this.OP[0xF4] = this.gb_CPU_UNK;
        this.OP[0xF5] = () => {
            MEMW(--this.SP, this.RA);
            MEMW(--this.SP,(this.FZ << 7) | (this.FN << 6) | (this.FH << 5) | (this.FC << 4));
            this.gbCPUTicks = 16;
        }; // PUSH AF
        this.OP[0xF6] = () => { this.gb_CPU_OR_A(MEMR(this.PC++), 8); }; // OR u8;
        this.OP[0xF7] = () => { this.gb_CPU_RST(0x30); }; // RST 0x30
        this.OP[0xF8] = () => {
            var n = MEMR(this.PC++);
            this.HL = this.SP + sb(n);
            this.FZ = 0;
            this.FN = 0;
            this.FH = (((this.SP & 0x0F) + (n & 0x0F)) > 0x0F) ? 1 : 0;
            this.FC = (((this.SP & 0xFF) + (n & 0xFF)) > 0xFF) ? 1 : 0;
            this.gbCPUTicks = 12;
        }; // LD HL,SP+u8;
        this.OP[0xF9] = () => { this.SP = this.HL; this.gbCPUTicks = 8; }; // LD SP,HL
        this.OP[0xFA] = () => {
            this.RA = MEMR((MEMR(this.PC + 1) << 8) | MEMR(this.PC));
            this.PC += 2;
            this.gbCPUTicks = 16;
        }; // LD A,(u16)
        this.OP[0xFB] = () => { this.gbIME = true; this.gbCPUTicks = 4; }; // EI
        this.OP[0xFC] = this.gb_CPU_UNK;
        this.OP[0xFD] = this.gb_CPU_UNK;
        this.OP[0xFE] = () => { this.T1 = MEMR(this.PC++); this.gb_CPU_CP_A('T1', 8); }; // CP u8
        this.OP[0xFF] = () => { this.gb_CPU_RST(0x38); }; // RST 0x38
    }

    initializeOPCB() {
        this.OPCB[0x00] = () => { this.RB = this.gb_CPU_RLC(this.RB); };
        this.OPCB[0x01] = () => { this.RC = this.gb_CPU_RLC(this.RC); };
        this.OPCB[0x02] = () => { this.RD = this.gb_CPU_RLC(this.RD); };
        this.OPCB[0x03] = () => { this.RE = this.gb_CPU_RLC(this.RE); };
        this.OPCB[0x04] = () => { this.HL = (this.HL & 0x00FF) | (this.gb_CPU_RLC(this.HL >> 8) << 8); };
        this.OPCB[0x05] = () => { this.HL = (this.HL & 0xFF00) | this.gb_CPU_RLC(this.HL & 0xFF); };
        this.OPCB[0x06] = () => { MEMW(this.HL, this.gb_CPU_RLC(MEMR(this.HL))); this.gbCPUTicks += 8; };
        this.OPCB[0x07] = () => { this.RA = this.gb_CPU_RLC(this.RA); };
        this.OPCB[0x08] = () => { this.RB = this.gb_CPU_RRC(this.RB); };
        this.OPCB[0x09] = () => { this.RC = this.gb_CPU_RRC(this.RC); };
        this.OPCB[0x0A] = () => { this.RD = this.gb_CPU_RRC(this.RD); };
        this.OPCB[0x0B] = () => { this.RE = this.gb_CPU_RRC(this.RE); };
        this.OPCB[0x0C] = () => { this.HL = (this.HL & 0x00FF) | (this.gb_CPU_RRC(this.HL >> 8) << 8); };
        this.OPCB[0x0D] = () => { this.HL = (this.HL & 0xFF00) | this.gb_CPU_RRC(this.HL & 0xFF); };
        this.OPCB[0x0E] = () => { MEMW(this.HL, this.gb_CPU_RRC(MEMR(this.HL))); this.gbCPUTicks += 8; };
        this.OPCB[0x0F] = () => { this.RA = this.gb_CPU_RRC(this.RA); };
        this.OPCB[0x10] = () => { this.RB = this.gb_CPU_RL(this.RB); };
        this.OPCB[0x11] = () => { this.RC = this.gb_CPU_RL(this.RC); };
        this.OPCB[0x12] = () => { this.RD = this.gb_CPU_RL(this.RD); };
        this.OPCB[0x13] = () => { this.RE = this.gb_CPU_RL(this.RE); };
        this.OPCB[0x14] = () => { this.HL = (this.HL & 0x00FF) | (this.gb_CPU_RL(this.HL >> 8) << 8); };
        this.OPCB[0x15] = () => { this.HL = (this.HL & 0xFF00) | this.gb_CPU_RL(this.HL & 0xFF); };
        this.OPCB[0x16] = () => {
            MEMW(this.HL, this.gb_CPU_RL(MEMR(this.HL)));
            this.gbCPUTicks += 8;
        };
        this.OPCB[0x17] = () => { this.RA = this.gb_CPU_RL(this.RA); };
        this.OPCB[0x18] = () => { this.RB = this.gb_CPU_RR(this.RB); };
        this.OPCB[0x19] = () => { this.RC = this.gb_CPU_RR(this.RC); };
        this.OPCB[0x1A] = () => { this.RD = this.gb_CPU_RR(this.RD); };
        this.OPCB[0x1B] = () => { this.RE = this.gb_CPU_RR(this.RE); };
        this.OPCB[0x1C] = () => {
            this.HL = (this.HL & 0x00FF) | (this.gb_CPU_RR(this.HL >> 8) << 8);
        };
        this.OPCB[0x1D] = () => {
            this.HL = (this.HL & 0xFF00) | this.gb_CPU_RR(this.HL & 0xFF);
        };
        this.OPCB[0x1E] = () => {
            MEMW(this.HL, this.gb_CPU_RR(MEMR(this.HL)));
            this.gbCPUTicks += 8;
        };
        this.OPCB[0x1F] = () => { this.RA = this.gb_CPU_RR(this.RA); };
        this.OPCB[0x20] = () => { this.gb_CPU_SLA_R('RB', 8); }; // SLA B
        this.OPCB[0x21] = () => { this.gb_CPU_SLA_R('RC', 8); }; // SLA C
        this.OPCB[0x22] = () => { this.gb_CPU_SLA_R('RD', 8); }; // SLA D
        this.OPCB[0x23] = () => { this.gb_CPU_SLA_R('RE', 8); }; // SLA E
        this.OPCB[0x24] = () => {
            this.T1 = this.HL >> 8;
            this.gb_CPU_SLA_R('T1', 8);
            this.HL = (this.T1 << 8) | (this.HL & 0x00FF);
        }; // SLA H
        this.OPCB[0x25] = () => {
            this.T1 = this.HL & 0xFF;
            this.gb_CPU_SLA_R('T1', 8);
            this.HL = (this.HL & 0xFF00) | this.T1;
        }; // SLA L
        this.OPCB[0x26] = () => {
            this.T1 = MEMR(this.HL);
            this.gb_CPU_SLA_R('T1', 16);
            MEMW(this.HL, this.T1);
        }; // SLA (HL)
        this.OPCB[0x27] = () => { this.gb_CPU_SLA_R('RA', 8); }; // SLA A
        this.OPCB[0x28] = () => {
            this.FC = this.RB & 1;
            this.RB = (this.RB >> 1) | (this.RB & 0x80);
            this.FN = 0;
            this.FH = 0;
            this.FZ = this.RB == 0 ? 1 : 0;
            this.gbCPUTicks = 8;
        }; // SRA n
        this.OPCB[0x29] = () => {
            this.FC = this.RC & 1;
            this.RC = (this.RC >> 1) | (this.RC & 0x80);
            this.FN = 0;
            this.FH = 0;
            this.FZ = this.RC == 0 ? 1 : 0;
            this.gbCPUTicks = 8;
        }; // SRA n
        this.OPCB[0x2A] = () => {
            this.FC = this.RD & 1;
            this.RD = (this.RD >> 1) | (this.RD & 0x80);
            this.FN = 0;
            this.FH = 0;
            this.FZ = this.RD == 0 ? 1 : 0;
            this.gbCPUTicks = 8;
        }; // SRA n
        this.OPCB[0x2B] = () => {
            this.FC = this.RE & 1;
            this.RE = (this.RE >> 1) | (this.RE & 0x80);
            this.FN = 0;
            this.FH = 0;
            this.FZ = this.RE == 0 ? 1 : 0;
            this.gbCPUTicks = 8;
        }; // SRA n
        this.OPCB[0x2C] = () => {
            var H = this.HL >> 8;
            this.FC = H & 1; H = (H >> 1) | (H & 0x80);
            this.FN = 0;
            this.FH = 0;
            this.FZ = H == 0 ? 1 : 0;
            this.HL = (H << 8) | (this.HL & 0x00FF);
            this.gbCPUTicks = 8;
        }; // SRA n
        this.OPCB[0x2D] = () => {
            var L = this.HL & 0xFF;
            this.FC = L & 1; L = (L >> 1) | (L & 0x80);
            this.FN = 0;
            this.FH = 0;
            this.FZ = L == 0 ? 1 : 0;
            this.HL = (this.HL & 0xFF00) | L;
            this.gbCPUTicks = 8;
        }; // SRA n
        this.OPCB[0x2E] = () => {
            var M = MEMR(this.HL);
            this.FC = M & 1; M = (M >> 1) | (M & 0x80);
            this.FN = 0;
            this.FH = 0;
            this.FZ = M == 0 ? 1 : 0;
            MEMW(this.HL, M);
            this.gbCPUTicks = 16;
        }; // SRA n
        this.OPCB[0x2F] = () => {
            this.FC = this.RA & 1;
            this.RA = (this.RA >> 1) | (this.RA & 0x80);
            this.FN = 0;
            this.FH = 0;
            this.FZ = this.RA == 0 ? 1 : 0;
            this.gbCPUTicks = 8;
        }; // SRA n
        this.OPCB[0x30] = () => { this.gb_CPU_SWAP('RB'); };
        this.OPCB[0x31] = () => { this.gb_CPU_SWAP('RC'); };
        this.OPCB[0x32] = () => { this.gb_CPU_SWAP('RD'); };
        this.OPCB[0x33] = () => { this.gb_CPU_SWAP('RE'); };
        this.OPCB[0x34] = () => { this.gb_CPU_SWAP('H'); };
        this.OPCB[0x35] = () => { this.gb_CPU_SWAP('L'); };
        this.OPCB[0x36] = () => { this.gb_CPU_SWAP('(HL)'); };
        this.OPCB[0x37] = () => { this.gb_CPU_SWAP('RA'); };
        this.OPCB[0x38] = () => {
            this.FC = this.RB & 1;
            this.RB = this.RB >> 1;
            this.FN = 0;
            this.FH = 0;
            this.FZ = this.RB == 0 ? 1 : 0;
            this.gbCPUTicks = 8;
        }; // SRL n
        this.OPCB[0x39] = () => {
            this.FC = this.RC & 1;
            this.RC = this.RC >> 1;
            this.FN = 0;
            this.FH = 0;
            this.FZ = this.RC == 0 ? 1 : 0;
            this.gbCPUTicks = 8;
        }; // SRL n
        this.OPCB[0x3A] = () => {
            this.FC = this.RD & 1;
            this.RD = this.RD >> 1;
            this.FN = 0;
            this.FH = 0;
            this.FZ = this.RD == 0 ? 1 : 0;
            this.gbCPUTicks = 8;
        }; // SRL n
        this.OPCB[0x3B] = () => {
            this.FC = this.RE & 1;
            this.RE = this.RE >> 1;
            this.FN = 0;
            this.FH = 0;
            this.FZ = this.RE == 0 ? 1 : 0;
            this.gbCPUTicks = 8;
        }; // SRL n
        this.OPCB[0x3C] = () => {
            var H = this.HL >> 8;
            this.FC = H & 1;
            H = H >> 1;
            this.FN = 0;
            this.FH = 0;
            this.FZ = H == 0 ? 1 : 0;
            this.HL = (H << 8) | (this.HL & 0x00FF);
            this.gbCPUTicks = 8;
        }; // SRL n
        this.OPCB[0x3D] = () => {
            var L = this.HL & 0xFF;
            this.FC = L & 1; L = L >> 1;
            this.FN = 0;
            this.FH = 0;
            this.FZ = L == 0 ? 1 : 0;
            this.HL = (this.HL & 0xFF00) | L;
            this.gbCPUTicks = 8;
        }; // SRL n
        this.OPCB[0x3E] = () => {
            var M = MEMR(this.HL);
            this.FC = M & 1;
            M = M >> 1;
            this.FN = 0;
            this.FH = 0;
            this.FZ = M == 0 ? 1 : 0;
            MEMW(this.HL, M);
            this.gbCPUTicks = 16;
        }; // SRL n
        this.OPCB[0x3F] = () => {
            this.FC = this.RA & 1;
            this.RA = this.RA >> 1;
            this.FN = 0;
            this.FH = 0;
            this.FZ = this.RA == 0 ? 1 : 0;
            this.gbCPUTicks = 8;
        }; // SRL n

        for (var i = 0; i < 8; i++) {
            var o = (1 << 6) | (i << 3);
            // BIT n,r - CB 01 xxx xxx - CB 01 bit reg
            this.OPCB[o | 7] = function (cpu: CPU, x: number) {
                return () => { cpu.FZ = !(cpu.RA & (1 << x)) ? 1 : 0; cpu.FN = 0; cpu.FH = 1; cpu.gbCPUTicks = 8; }
            } (this, i);
            this.MNCB[o | 7] = new Function("return 'BIT " + i + ",A';");
            this.OPCB[o | 0] = function (cpu: CPU, x: number) {
                return () => { cpu.FZ = !(cpu.RB & (1 << x)) ? 1 : 0; cpu.FN = 0; cpu.FH = 1; cpu.gbCPUTicks = 8; }
            } (this, i);
            this.MNCB[o | 0] = new Function("return 'BIT " + i + ",B';");
            this.OPCB[o | 1] = function (cpu: CPU, x: number) {
                return () => { cpu.FZ = !(cpu.RC & (1 << x)) ? 1 : 0; cpu.FN = 0; cpu.FH = 1; cpu.gbCPUTicks = 8; }
            } (this, i);
            this.MNCB[o | 1] = new Function("return 'BIT " + i + ",C';");
            this.OPCB[o | 2] = function (cpu: CPU, x: number) {
                return () => { cpu.FZ = !(cpu.RD & (1 << x)) ? 1 : 0; cpu.FN = 0; cpu.FH = 1; cpu.gbCPUTicks = 8; }
            } (this, i);
            this.MNCB[o | 2] = new Function("return 'BIT " + i + ",D';");
            this.OPCB[o | 3] = function (cpu: CPU, x: number) {
                return () => { cpu.FZ = !(cpu.RE & (1 << x)) ? 1 : 0; cpu.FN = 0; cpu.FH = 1; cpu.gbCPUTicks = 8; }
            } (this, i);
            this.MNCB[o | 3] = new Function("return 'BIT " + i + ",E';");
            this.OPCB[o | 4] = function (cpu: CPU, x: number) {
                return () => { cpu.FZ = !(cpu.HL & (256 << x)) ? 1 : 0; cpu.FN = 0; cpu.FH = 1; cpu.gbCPUTicks = 8; }
            } (this, i);
            this.MNCB[o | 4] = new Function("return 'BIT " + i + ",H';");
            this.OPCB[o | 5] = function (cpu: CPU, x: number) {
                return () => { cpu.FZ = !(cpu.HL & (1 << x)) ? 1 : 0; cpu.FN = 0; cpu.FH = 1; cpu.gbCPUTicks = 8; }
            } (this, i);
            this.MNCB[o | 5] = new Function("return 'BIT " + i + ",L';");
            this.OPCB[o | 6] = function (cpu: CPU, x: number) {
                return () => { cpu.FZ = !(MEMR(cpu.HL) & (1 << x)) ? 1 : 0; cpu.FN = 0; cpu.FH = 1; cpu.gbCPUTicks = 16; }
            } (this, i);
            this.MNCB[o | 6] = new Function("return 'BIT " + i + ",(HL)';");
            // RES n,r - CB 10 xxx xxx - CB 10 bit reg
            o = (2 << 6) | (i << 3);
            this.OPCB[o | 7] = function (cpu: CPU, x: number) {
                return () => { cpu.RA &= ((~(1 << x)) & 0xFF); cpu.gbCPUTicks = 8; }
            } (this, i);
            this.MNCB[o | 7] = new Function("return 'RES " + i + ",A';");
            this.OPCB[o | 0] = function (cpu: CPU, x: number) {
                return () => { cpu.RB &= ((~(1 << x)) & 0xFF); cpu.gbCPUTicks = 8; }
            } (this, i);
            this.MNCB[o | 0] = new Function("return 'RES " + i + ",B';");
            this.OPCB[o | 1] = function (cpu: CPU, x: number) {
                return () => { cpu.RC &= ((~(1 << x)) & 0xFF); cpu.gbCPUTicks = 8; }
            } (this, i);
            this.MNCB[o | 1] = new Function("return 'RES " + i + ",C';");
            this.OPCB[o | 2] = function (cpu: CPU, x: number) {
                return () => { cpu.RD &= ((~(1 << x)) & 0xFF); cpu.gbCPUTicks = 8; }
            } (this, i);
            this.MNCB[o | 2] = new Function("return 'RES " + i + ",D';");
            this.OPCB[o | 3] = function (cpu: CPU, x: number) {
                return () => { cpu.RE &= ((~(1 << x)) & 0xFF); cpu.gbCPUTicks = 8; }
            } (this, i);
            this.MNCB[o | 3] = new Function("return 'RES " + i + ",E';");
            this.OPCB[o | 4] = function (cpu: CPU, x: number) {
                return () => { cpu.HL &= ((~(256 << x)) & 0xFFFF); cpu.gbCPUTicks = 8; }
            } (this, i);
            this.MNCB[o | 4] = new Function("return 'RES " + i + ",H';");
            this.OPCB[o | 5] = function (cpu: CPU, x: number) {
                return () => { cpu.HL &= ((~(1 << x)) & 0xFFFF); cpu.gbCPUTicks = 8; }
            } (this, i);
            this.MNCB[o | 5] = new Function("return 'RES " + i + ",L';");
            this.OPCB[o | 6] = function (cpu: CPU, x: number) {
                return () => { MEMW(cpu.HL, MEMR(cpu.HL) & ((~(1 << x)) & 0xFF)); cpu.gbCPUTicks = 16; }
            } (this, i);
            this.MNCB[o | 6] = new Function("return 'RES " + i + ",(HL)';");
            // SET n,r - CB 11 xxx xxx - CB 11 bit reg
            o = (3 << 6) | (i << 3);
            this.OPCB[o | 7] = function (cpu: CPU, x: number) {
                return () => { cpu.RA |= (1 << x); cpu.gbCPUTicks = 8; }
            } (this, i);
            this.MNCB[o | 7] = new Function("return 'SET " + i + ",A';");
            this.OPCB[o | 0] = function (cpu: CPU, x: number) {
                return () => { cpu.RB |= (1 << x); cpu.gbCPUTicks = 8; }
            } (this, i);
            this.MNCB[o | 0] = new Function("return 'SET " + i + ",B';");
            this.OPCB[o | 1] = function (cpu: CPU, x: number) {
                return () => { cpu.RC |= (1 << x); cpu.gbCPUTicks = 8; }
            } (this, i);
            this.MNCB[o | 1] = new Function("return 'SET " + i + ",C';");
            this.OPCB[o | 2] = function (cpu: CPU, x: number) {
                return () => { cpu.RD |= (1 << x); cpu.gbCPUTicks = 8; }
            } (this, i);
            this.MNCB[o | 2] = new Function("return 'SET " + i + ",D';");
            this.OPCB[o | 3] = function (cpu: CPU, x: number) {
                return () => { cpu.RE |= (1 << x); cpu.gbCPUTicks = 8; }
            } (this, i);
            this.MNCB[o | 3] = new Function("return 'SET " + i + ",E';");
            this.OPCB[o | 4] = function (cpu: CPU, x: number) {
                return () => { cpu.HL |= (256 << x); cpu.gbCPUTicks = 8; }
            } (this, i);
            this.MNCB[o | 4] = new Function("return 'SET " + i + ",H';");
            this.OPCB[o | 5] = function (cpu: CPU, x: number) {
                return () => { cpu.HL |= (1 << x); cpu.gbCPUTicks = 8; }
            } (this, i);
            this.MNCB[o | 5] = new Function("return 'SET " + i + ",L';");
            this.OPCB[o | 6] = function (cpu: CPU, x: number) {
                return () => { MEMW(cpu.HL, MEMR(cpu.HL) | (1 << x)); cpu.gbCPUTicks = 16; }
            } (this, i);
            this.MNCB[o | 6] = new Function("return 'SET " + i + ",(HL)';");
        }
    }

    initializeMN() {
        this.MN[0x01] = () => { return 'LD BC,0x' + hex4((MEMR(this.PC + 2) << 8) + MEMR(this.PC + 1)); };
        this.MN[0x00] = () => { return 'NOP'; };
        this.MN[0x02] = () => { return 'LD (BC),A'; };
        this.MN[0x03] = () => { return 'INC BC'; };
        this.MN[0x04] = () => { return 'INC B'; };
        this.MN[0x05] = () => { return 'DEC B'; };
        this.MN[0x06] = () => { return 'LD B,0x' + hex2(MEMR(this.PC + 1)); };
        this.MN[0x07] = () => { return 'RLCA'; };
        this.MN[0x08] = () => { return 'LD(0x' + hex4((MEMR(this.PC + 2) << 8) + MEMR(this.PC + 1)) + '),SP'; };
        this.MN[0x09] = () => { return 'ADD HL,BC'; };
        this.MN[0x0A] = () => { return 'LD A,(BC)'; };
        this.MN[0x0B] = () => { return 'DEC BC'; };
        this.MN[0x0C] = () => { return 'INC C'; };
        this.MN[0x0D] = () => { return 'DEC C'; };
        this.MN[0x0E] = () => { return 'LD C,0x' + hex2(MEMR(this.PC + 1)); };
        this.MN[0x0F] = () => { return 'RRCA'; };
        this.MN[0x10] = () => { return 'STOP'; };
        this.MN[0x11] = () => { return 'LD DE,0x' + hex4((MEMR(this.PC + 2) << 8) + MEMR(this.PC + 1)); };
        this.MN[0x12] = () => { return 'LD (DE),A'; };
        this.MN[0x13] = () => { return 'INC DE'; };
        this.MN[0x14] = () => { return 'INC D'; };
        this.MN[0x15] = () => { return 'DEC D'; };
        this.MN[0x16] = () => { return 'LD D,0x' + hex2(MEMR(this.PC + 1)); };
        this.MN[0x17] = () => { return 'RLA'; };
        this.MN[0x18] = () => { return 'JR ' + sb(MEMR(this.PC + 1)) + '; 0x' + hex2(MEMR(this.PC + 1)); };
        this.MN[0x19] = () => { return 'ADD HL,DE'; };
        this.MN[0x1A] = () => { return 'LD A,(DE)'; };
        this.MN[0x1B] = () => { return 'DEC DE'; };
        this.MN[0x1C] = () => { return 'INC E'; };
        this.MN[0x1D] = () => { return 'DEC E'; };
        this.MN[0x1E] = () => { return 'LD E,0x' + hex2(MEMR(this.PC + 1)); };
        this.MN[0x1F] = () => { return 'RRA'; };
        this.MN[0x20] = () => { return 'JR NZ,' + sb(MEMR(this.PC + 1)) + '; 0x' + hex2(MEMR(this.PC + 1)); };
        this.MN[0x21] = () => { return 'LD HL,0x' + hex4((MEMR(this.PC + 2) << 8) + MEMR(this.PC + 1)); };
        this.MN[0x22] = () => { return 'LDI (HL),A'; };
        this.MN[0x23] = () => { return 'INC HL'; };
        this.MN[0x24] = () => { return 'INC H'; };
        this.MN[0x25] = () => { return 'DEC H'; };
        this.MN[0x26] = () => { return 'LD H,0x' + hex2(MEMR(this.PC + 1)); };
        this.MN[0x27] = () => { return 'DAA'; };
        this.MN[0x28] = () => { return 'JR Z,' + sb(MEMR(this.PC + 1)) + '; 0x' + hex2(MEMR(this.PC + 1)); };
        this.MN[0x29] = () => { return 'ADD HL,HL'; };
        this.MN[0x2A] = () => { return 'LDI A,(HL)'; };
        this.MN[0x2B] = () => { return 'DEC HL'; };
        this.MN[0x2C] = () => { return 'INC L'; };
        this.MN[0x2D] = () => { return 'DEC L'; };
        this.MN[0x2E] = () => { return 'LD L,0x' + hex2(MEMR(this.PC + 1)); };
        this.MN[0x2F] = () => { return 'CPL'; };
        this.MN[0x30] = () => { return 'JR NC,' + sb(MEMR(this.PC + 1)) + '; 0x' + hex2(MEMR(this.PC + 1)); };
        this.MN[0x31] = () => { return 'LD SP,0x' + hex4((MEMR(this.PC + 2) << 8) + MEMR(this.PC + 1)); };
        this.MN[0x32] = () => { return 'LDD (HL),A'; };
        this.MN[0x33] = () => { return 'INC SP'; };
        this.MN[0x34] = () => { return 'INC (HL)'; };
        this.MN[0x35] = () => { return 'DEC (HL)'; };
        this.MN[0x36] = () => { return 'LD (HL),0x' + hex2(MEMR(this.PC + 1)); };
        this.MN[0x37] = () => { return 'SCF'; };
        this.MN[0x38] = () => { return 'JR C,' + sb(MEMR(this.PC + 1)) + '; 0x' + hex2(MEMR(this.PC + 1)); };
        this.MN[0x39] = () => { return 'ADD HL,SP'; };
        this.MN[0x3A] = () => { return 'LDD A,(HL)'; };
        this.MN[0x3B] = () => { return 'DEC SP'; };
        this.MN[0x3C] = () => { return 'INC A'; };
        this.MN[0x3D] = () => { return 'DEC A'; };
        this.MN[0x3E] = () => { return 'LD A,0x' + hex2(MEMR(this.PC + 1)); }; // ???
        this.MN[0x3F] = () => { return 'CCF'; };
        this.MN[0x40] = () => { return 'LD B,B'; };
        this.MN[0x41] = () => { return 'LD B,C'; };
        this.MN[0x42] = () => { return 'LD B,D'; };
        this.MN[0x43] = () => { return 'LD B,E'; };
        this.MN[0x44] = () => { return 'LD B,H'; };
        this.MN[0x45] = () => { return 'LD B,L'; };
        this.MN[0x46] = () => { return 'LD B,(HL)'; };
        this.MN[0x47] = () => { return 'LD B,A'; };
        this.MN[0x48] = () => { return 'LD C,B'; };
        this.MN[0x49] = () => { return 'LD C,C'; };
        this.MN[0x4A] = () => { return 'LD C,D'; };
        this.MN[0x4B] = () => { return 'LD C,E'; };
        this.MN[0x4C] = () => { return 'LD C,H'; };
        this.MN[0x4D] = () => { return 'LD C,L'; };
        this.MN[0x4E] = () => { return 'LD C,(HL)'; };
        this.MN[0x4F] = () => { return 'LD C,A'; };
        this.MN[0x50] = () => { return 'LD D,B'; };
        this.MN[0x51] = () => { return 'LD D,C'; };
        this.MN[0x52] = () => { return 'LD D,D'; };
        this.MN[0x53] = () => { return 'LD D,E'; };
        this.MN[0x54] = () => { return 'LD D,H'; };
        this.MN[0x55] = () => { return 'LD D,L'; };
        this.MN[0x56] = () => { return 'LD D,(HL)'; };
        this.MN[0x57] = () => { return 'LD D,A'; };
        this.MN[0x58] = () => { return 'LD E,B'; };
        this.MN[0x59] = () => { return 'LD E,C'; };
        this.MN[0x5A] = () => { return 'LD E,D'; };
        this.MN[0x5B] = () => { return 'LD E,E'; };
        this.MN[0x5C] = () => { return 'LD E,H'; };
        this.MN[0x5D] = () => { return 'LD E,L'; };
        this.MN[0x5E] = () => { return 'LD E,(HL)'; };
        this.MN[0x5F] = () => { return 'LD E,A'; };
        this.MN[0x60] = () => { return 'LD H,B'; };
        this.MN[0x61] = () => { return 'LD H,C'; };
        this.MN[0x62] = () => { return 'LD H,D'; };
        this.MN[0x63] = () => { return 'LD H,E'; };
        this.MN[0x64] = () => { return 'LD H,H'; };
        this.MN[0x65] = () => { return 'LD H,L'; };
        this.MN[0x66] = () => { return 'LD H,(HL)'; };
        this.MN[0x67] = () => { return 'LD H,A'; };
        this.MN[0x68] = () => { return 'LD L,B'; };
        this.MN[0x69] = () => { return 'LD L,C'; };
        this.MN[0x6A] = () => { return 'LD L,D'; };
        this.MN[0x6B] = () => { return 'LD L,E'; };
        this.MN[0x6C] = () => { return 'LD L,H'; };
        this.MN[0x6D] = () => { return 'LD L,L'; };
        this.MN[0x6E] = () => { return 'LD L,(HL)'; };
        this.MN[0x6F] = () => { return 'LD L,A'; };
        this.MN[0x70] = () => { return 'LD (HL),B'; };
        this.MN[0x71] = () => { return 'LD (HL),C'; };
        this.MN[0x72] = () => { return 'LD (HL),D'; };
        this.MN[0x73] = () => { return 'LD (HL),E'; };
        this.MN[0x74] = () => { return 'LD (HL),H'; };
        this.MN[0x75] = () => { return 'LD (HL),L'; };
        this.MN[0x76] = () => { return 'HALT'; };
        this.MN[0x77] = () => { return 'LD (HL),A'; };
        this.MN[0x78] = () => { return 'LD A,B'; };
        this.MN[0x79] = () => { return 'LD A,C'; };
        this.MN[0x7A] = () => { return 'LD A,D'; };
        this.MN[0x7B] = () => { return 'LD A,E'; };
        this.MN[0x7C] = () => { return 'LD A,H'; };
        this.MN[0x7D] = () => { return 'LD A,L'; };
        this.MN[0x7E] = () => { return 'LD A,(HL)'; };
        this.MN[0x7F] = () => { return 'LD A,A'; };
        this.MN[0x80] = () => { return 'ADD A,B'; };
        this.MN[0x81] = () => { return 'ADD A,C'; };
        this.MN[0x82] = () => { return 'ADD A,D'; };
        this.MN[0x83] = () => { return 'ADD A,E'; };
        this.MN[0x84] = () => { return 'ADD A,H'; };
        this.MN[0x85] = () => { return 'ADD A,L'; };
        this.MN[0x86] = () => { return 'ADD A,(HL)'; };
        this.MN[0x87] = () => { return 'ADD A,A'; };
        this.MN[0x88] = () => { return 'ADC A,B'; };
        this.MN[0x89] = () => { return 'ADC A,C'; };
        this.MN[0x8A] = () => { return 'ADC A,D'; };
        this.MN[0x8B] = () => { return 'ADC A,E'; };
        this.MN[0x8C] = () => { return 'ADC A,H'; };
        this.MN[0x8D] = () => { return 'ADC A,L'; };
        this.MN[0x8E] = () => { return 'ADC A,(HL)'; };
        this.MN[0x8F] = () => { return 'ADC A,A'; };
        this.MN[0x90] = () => { return 'SUB B'; };
        this.MN[0x91] = () => { return 'SUB C'; };
        this.MN[0x92] = () => { return 'SUB D'; };
        this.MN[0x93] = () => { return 'SUB E'; };
        this.MN[0x94] = () => { return 'SUB H'; };
        this.MN[0x95] = () => { return 'SUB L'; };
        this.MN[0x96] = () => { return 'SUB (HL)'; };
        this.MN[0x97] = () => { return 'SUB A'; };
        this.MN[0x98] = () => { return 'SBC A,B'; };
        this.MN[0x99] = () => { return 'SBC A,C'; };
        this.MN[0x9A] = () => { return 'SBC A,D'; };
        this.MN[0x9B] = () => { return 'SBC A,E'; };
        this.MN[0x9C] = () => { return 'SBC A,H'; };
        this.MN[0x9D] = () => { return 'SBC A,L'; };
        this.MN[0x9E] = () => { return 'SBC A,(HL)'; };
        this.MN[0x9F] = () => { return 'SBC A,A'; };
        this.MN[0xA0] = () => { return 'AND B'; };
        this.MN[0xA1] = () => { return 'AND C'; };
        this.MN[0xA2] = () => { return 'AND D'; };
        this.MN[0xA3] = () => { return 'AND E'; };
        this.MN[0xA4] = () => { return 'AND H'; };
        this.MN[0xA5] = () => { return 'AND L'; };
        this.MN[0xA6] = () => { return 'AND (HL)'; };
        this.MN[0xA7] = () => { return 'AND A'; };
        this.MN[0xA8] = () => { return 'XOR B'; };
        this.MN[0xA9] = () => { return 'XOR C'; };
        this.MN[0xAA] = () => { return 'XOR D'; };
        this.MN[0xAB] = () => { return 'XOR E'; };
        this.MN[0xAC] = () => { return 'XOR H'; };
        this.MN[0xAD] = () => { return 'XOR L'; };
        this.MN[0xAE] = () => { return 'XOR (HL)'; };
        this.MN[0xAF] = () => { return 'XOR A'; };
        this.MN[0xB0] = () => { return 'OR B'; };
        this.MN[0xB1] = () => { return 'OR C'; };
        this.MN[0xB2] = () => { return 'OR D'; };
        this.MN[0xB3] = () => { return 'OR E'; };
        this.MN[0xB4] = () => { return 'OR H'; };
        this.MN[0xB5] = () => { return 'OR L'; };
        this.MN[0xB6] = () => { return 'OR (HL)'; };
        this.MN[0xB7] = () => { return 'OR A'; };
        this.MN[0xB8] = () => { return 'CP B'; };
        this.MN[0xB9] = () => { return 'CP C'; };
        this.MN[0xBA] = () => { return 'CP D'; };
        this.MN[0xBB] = () => { return 'CP E'; };
        this.MN[0xBC] = () => { return 'CP H'; };
        this.MN[0xBD] = () => { return 'CP L'; };
        this.MN[0xBE] = () => { return 'CP (HL)'; };
        this.MN[0xBF] = () => { return 'CP A'; };
        this.MN[0xC0] = () => { return 'RET NZ'; };
        this.MN[0xC1] = () => { return 'POP BC'; };
        this.MN[0xC2] = () => { return 'JP NZ,0x' + hex(MEMR(this.PC + 1) | (MEMR(this.PC + 2) << 8)); };
        this.MN[0xC3] = () => { return 'JP 0x' + hex(MEMR(this.PC + 1) | (MEMR(this.PC + 2) << 8)); };
        this.MN[0xC4] = () => { return 'CALL NZ,0x' + hex(MEMR(this.PC + 1) | (MEMR(this.PC + 2) << 8)); };
        this.MN[0xC5] = () => { return 'PUSH BC'; };
        this.MN[0xC6] = () => { return 'ADD A,0x' + hex2(MEMR(this.PC + 1)); };
        this.MN[0xC7] = () => { return 'RST 0x00'; };
        this.MN[0xC8] = () => { return 'RET Z'; };
        this.MN[0xC9] = () => { return 'RET'; };
        this.MN[0xCA] = () => { return 'JP Z,0x' + hex(MEMR(this.PC + 1) | (MEMR(this.PC + 2) << 8)); };
        this.MN[0xCB] = () => { return this.MNCB[MEMR(this.PC + 1)](); };
        this.MN[0xCC] = () => { return 'CALL Z,0x' + hex(MEMR(this.PC + 1) | (MEMR(this.PC + 2) << 8)); };
        this.MN[0xCD] = () => { return 'CALL 0x' + hex(MEMR(this.PC + 1) | (MEMR(this.PC + 2) << 8)); };
        this.MN[0xCE] = () => { return 'ADC A,0x' + hex2(MEMR(this.PC + 1)); };
        this.MN[0xCF] = () => { return 'RST 0x08'; };
        this.MN[0xD0] = () => { return 'RET NC'; };
        this.MN[0xD1] = () => { return 'POP DE'; };
        this.MN[0xD2] = () => { return 'JP NC,0x' + hex(MEMR(this.PC + 1) | (MEMR(this.PC + 2) << 8)); };
        this.MN[0xD4] = () => { return 'CALL NC,0x' + hex(MEMR(this.PC + 1) | (MEMR(this.PC + 2) << 8)); };
        this.MN[0xD5] = () => { return 'PUSH DE'; };
        this.MN[0xD6] = () => { return 'SUB 0x' + hex2(MEMR(this.PC + 1)); };
        this.MN[0xD7] = () => { return 'RST 0x10'; };
        this.MN[0xD8] = () => { return 'RET C'; };
        this.MN[0xD9] = () => { return 'RETI'; };
        this.MN[0xDA] = () => { return 'JP C,0x' + hex(MEMR(this.PC + 1) | (MEMR(this.PC + 2) << 8)); };
        this.MN[0xDC] = () => { return 'CALL C,0x' + hex(MEMR(this.PC + 1) | (MEMR(this.PC + 2) << 8)); };
        this.MN[0xDE] = () => { return 'SBC A,0x' + hex2(MEMR(this.PC + 1)); };
        this.MN[0xDF] = () => { return 'RST 0x18'; };
        this.MN[0xE0] = () => { return 'LD (0xFF00+0x' + hex2(MEMR(this.PC + 1)) + '),A'; };
        this.MN[0xE1] = () => { return 'POP HL'; };
        this.MN[0xE2] = () => { return 'LD (0xFF00+C),A'; };
        this.MN[0xE5] = () => { return 'PUSH HL'; };
        this.MN[0xE6] = () => { return 'AND 0x' + hex2(MEMR(this.PC + 1)); };
        this.MN[0xE7] = () => { return 'RST 0x20'; };
        this.MN[0xE8] = () => { return 'ADD SP,0x' + hex2(MEMR(this.PC + 1)); };
        this.MN[0xE9] = () => { return 'JP (HL)'; };
        this.MN[0xEA] = () => { return 'LD (0x' + hex4((MEMR(this.PC + 2) << 8) | MEMR(this.PC + 1)) + '),A'; };
        this.MN[0xEE] = () => { return 'XOR 0x' + hex2(MEMR(this.PC + 1)); };
        this.MN[0xEF] = () => { return 'RST 0x28'; };
        this.MN[0xF0] = () => { return 'LD A,(0xFF00+0x' + hex2(MEMR(this.PC + 1)) + ')'; };
        this.MN[0xF1] = () => { return 'POP AF'; };
        this.MN[0xF2] = () => { return 'LD A,(0xFF00+C)'; };
        this.MN[0xF3] = () => { return 'DI'; };
        this.MN[0xF5] = () => { return 'PUSH AF'; };
        this.MN[0xF6] = () => { return 'OR 0x' + hex2(MEMR(this.PC + 1)); };
        this.MN[0xF7] = () => { return 'RST 0x30'; };
        this.MN[0xF8] = () => { return 'LD HL,SP+0x' + hex2(MEMR(this.PC + 1)); };
        this.MN[0xF9] = () => { return 'LD SP,HL'; };
        this.MN[0xFA] = () => { return 'LD A,(0x' + hex4((MEMR(this.PC + 2) << 8) + MEMR(this.PC + 1)) + ')'; };
        this.MN[0xFB] = () => { return 'EI'; };
        this.MN[0xFE] = () => { return 'CP ' + MEMR(this.PC + 1) + '; 0x' + hex2(MEMR(this.PC + 1)); };
        this.MN[0xFF] = () => { return 'RST 0x38'; };
    }

    initializeMNCB() {
        this.MNCB[0x00] = () => { return 'RLC B'; };
        this.MNCB[0x01] = () => { return 'RLC C'; };
        this.MNCB[0x02] = () => { return 'RLC D'; };
        this.MNCB[0x03] = () => { return 'RLC E'; };
        this.MNCB[0x04] = () => { return 'RLC H'; };
        this.MNCB[0x05] = () => { return 'RLC L'; };
        this.MNCB[0x06] = () => { return 'RLC (HL)'; };
        this.MNCB[0x07] = () => { return 'RLC A'; };
        this.MNCB[0x08] = () => { return 'RRC B'; };
        this.MNCB[0x09] = () => { return 'RRC C'; };
        this.MNCB[0x0A] = () => { return 'RRC D'; };
        this.MNCB[0x0B] = () => { return 'RRC E'; };
        this.MNCB[0x0C] = () => { return 'RRC H'; };
        this.MNCB[0x0D] = () => { return 'RRC L'; };
        this.MNCB[0x0E] = () => { return 'RRC (HL)'; };
        this.MNCB[0x0F] = () => { return 'RRC A'; };
        this.MNCB[0x10] = () => { return 'RL B'; };
        this.MNCB[0x11] = () => { return 'RL C'; };
        this.MNCB[0x12] = () => { return 'RL D'; };
        this.MNCB[0x13] = () => { return 'RL E'; };
        this.MNCB[0x14] = () => { return 'RL H'; };
        this.MNCB[0x15] = () => { return 'RL L'; };
        this.MNCB[0x16] = () => { return 'RL (HL)'; };
        this.MNCB[0x17] = () => { return 'RL A'; };
        this.MNCB[0x18] = () => { return 'RR B'; };
        this.MNCB[0x19] = () => { return 'RR C'; };
        this.MNCB[0x1A] = () => { return 'RR D'; };
        this.MNCB[0x1B] = () => { return 'RR E'; };
        this.MNCB[0x1C] = () => { return 'RR H'; };
        this.MNCB[0x1D] = () => { return 'RR L'; };
        this.MNCB[0x1E] = () => { return 'RR (HL)'; };
        this.MNCB[0x1F] = () => { return 'RR A'; };
        this.MNCB[0x20] = () => { return 'SLA B'; };
        this.MNCB[0x21] = () => { return 'SLA C'; };
        this.MNCB[0x22] = () => { return 'SLA D'; };
        this.MNCB[0x23] = () => { return 'SLA E'; };
        this.MNCB[0x24] = () => { return 'SLA H'; };
        this.MNCB[0x25] = () => { return 'SLA L'; };
        this.MNCB[0x26] = () => { return 'SLA (HL)'; };
        this.MNCB[0x27] = () => { return 'SLA A'; };
        this.MNCB[0x28] = () => { return 'SRA B'; };
        this.MNCB[0x29] = () => { return 'SRA C'; };
        this.MNCB[0x2A] = () => { return 'SRA D'; };
        this.MNCB[0x2B] = () => { return 'SRA E'; };
        this.MNCB[0x2C] = () => { return 'SRA H'; };
        this.MNCB[0x2D] = () => { return 'SRA L'; };
        this.MNCB[0x2E] = () => { return 'SRA (HL)'; };
        this.MNCB[0x2F] = () => { return 'SRA A'; };
        this.MNCB[0x30] = () => { return 'SWAP B'; };
        this.MNCB[0x31] = () => { return 'SWAP C'; };
        this.MNCB[0x32] = () => { return 'SWAP D'; };
        this.MNCB[0x33] = () => { return 'SWAP E'; };
        this.MNCB[0x34] = () => { return 'SWAP H'; };
        this.MNCB[0x35] = () => { return 'SWAP L'; };
        this.MNCB[0x36] = () => { return 'SWAP (HL)'; };
        this.MNCB[0x37] = () => { return 'SWAP A'; };
        this.MNCB[0x38] = () => { return 'SRL B'; };
        this.MNCB[0x39] = () => { return 'SRL C'; };
        this.MNCB[0x3A] = () => { return 'SRL D'; };
        this.MNCB[0x3B] = () => { return 'SRL E'; };
        this.MNCB[0x3C] = () => { return 'SRL H'; };
        this.MNCB[0x3D] = () => { return 'SRL L'; };
        this.MNCB[0x3E] = () => { return 'SRL (HL)'; };
        this.MNCB[0x3F] = () => { return 'SRL A'; };
    }

    gb_Init_CPU() {
        this.gbPause = true;
        this.RA = 0x01; // 0x01->GB/SGB; 0xFF->GBP; 0x11->GBC
        this.FZ = 0x01; // F=0xB0->Z1 N0 H1 C1
        this.FN = 0x00;
        this.FH = 0x01;
        this.FC = 0x01;
        this.RB = 0x00;
        this.RC = 0x13;
        this.RD = 0x00;
        this.RE = 0xD8;
        this.PC = 0x0100;
        this.SP = 0xFFFE;
        this.HL = 0x014D;
        this.gbCPUTicks = 0;
    }

    static gbDAATable = [ // DDA code from VisualBoyAdvance
        0x0080, 0x0100, 0x0200, 0x0300, 0x0400, 0x0500, 0x0600, 0x0700, 0x0800, 0x0900, 0x1020, 0x1120,
        0x1220, 0x1320, 0x1420, 0x1520, 0x1000, 0x1100, 0x1200, 0x1300, 0x1400, 0x1500, 0x1600, 0x1700,
        0x1800, 0x1900, 0x2020, 0x2120, 0x2220, 0x2320, 0x2420, 0x2520, 0x2000, 0x2100, 0x2200, 0x2300,
        0x2400, 0x2500, 0x2600, 0x2700, 0x2800, 0x2900, 0x3020, 0x3120, 0x3220, 0x3320, 0x3420, 0x3520,
        0x3000, 0x3100, 0x3200, 0x3300, 0x3400, 0x3500, 0x3600, 0x3700, 0x3800, 0x3900, 0x4020, 0x4120,
        0x4220, 0x4320, 0x4420, 0x4520, 0x4000, 0x4100, 0x4200, 0x4300, 0x4400, 0x4500, 0x4600, 0x4700,
        0x4800, 0x4900, 0x5020, 0x5120, 0x5220, 0x5320, 0x5420, 0x5520, 0x5000, 0x5100, 0x5200, 0x5300,
        0x5400, 0x5500, 0x5600, 0x5700, 0x5800, 0x5900, 0x6020, 0x6120, 0x6220, 0x6320, 0x6420, 0x6520,
        0x6000, 0x6100, 0x6200, 0x6300, 0x6400, 0x6500, 0x6600, 0x6700, 0x6800, 0x6900, 0x7020, 0x7120,
        0x7220, 0x7320, 0x7420, 0x7520, 0x7000, 0x7100, 0x7200, 0x7300, 0x7400, 0x7500, 0x7600, 0x7700,
        0x7800, 0x7900, 0x8020, 0x8120, 0x8220, 0x8320, 0x8420, 0x8520, 0x8000, 0x8100, 0x8200, 0x8300,
        0x8400, 0x8500, 0x8600, 0x8700, 0x8800, 0x8900, 0x9020, 0x9120, 0x9220, 0x9320, 0x9420, 0x9520,
        0x9000, 0x9100, 0x9200, 0x9300, 0x9400, 0x9500, 0x9600, 0x9700, 0x9800, 0x9900, 0x00B0, 0x0130,
        0x0230, 0x0330, 0x0430, 0x0530, 0x0090, 0x0110, 0x0210, 0x0310, 0x0410, 0x0510, 0x0610, 0x0710,
        0x0810, 0x0910, 0x1030, 0x1130, 0x1230, 0x1330, 0x1430, 0x1530, 0x1010, 0x1110, 0x1210, 0x1310,
        0x1410, 0x1510, 0x1610, 0x1710, 0x1810, 0x1910, 0x2030, 0x2130, 0x2230, 0x2330, 0x2430, 0x2530,
        0x2010, 0x2110, 0x2210, 0x2310, 0x2410, 0x2510, 0x2610, 0x2710, 0x2810, 0x2910, 0x3030, 0x3130,
        0x3230, 0x3330, 0x3430, 0x3530, 0x3010, 0x3110, 0x3210, 0x3310, 0x3410, 0x3510, 0x3610, 0x3710,
        0x3810, 0x3910, 0x4030, 0x4130, 0x4230, 0x4330, 0x4430, 0x4530, 0x4010, 0x4110, 0x4210, 0x4310,
        0x4410, 0x4510, 0x4610, 0x4710, 0x4810, 0x4910, 0x5030, 0x5130, 0x5230, 0x5330, 0x5430, 0x5530,
        0x5010, 0x5110, 0x5210, 0x5310, 0x5410, 0x5510, 0x5610, 0x5710, 0x5810, 0x5910, 0x6030, 0x6130,
        0x6230, 0x6330, 0x6430, 0x6530, 0x6010, 0x6110, 0x6210, 0x6310, 0x6410, 0x6510, 0x6610, 0x6710,
        0x6810, 0x6910, 0x7030, 0x7130, 0x7230, 0x7330, 0x7430, 0x7530, 0x7010, 0x7110, 0x7210, 0x7310,
        0x7410, 0x7510, 0x7610, 0x7710, 0x7810, 0x7910, 0x8030, 0x8130, 0x8230, 0x8330, 0x8430, 0x8530,
        0x8010, 0x8110, 0x8210, 0x8310, 0x8410, 0x8510, 0x8610, 0x8710, 0x8810, 0x8910, 0x9030, 0x9130,
        0x9230, 0x9330, 0x9430, 0x9530, 0x9010, 0x9110, 0x9210, 0x9310, 0x9410, 0x9510, 0x9610, 0x9710,
        0x9810, 0x9910, 0xA030, 0xA130, 0xA230, 0xA330, 0xA430, 0xA530, 0xA010, 0xA110, 0xA210, 0xA310,
        0xA410, 0xA510, 0xA610, 0xA710, 0xA810, 0xA910, 0xB030, 0xB130, 0xB230, 0xB330, 0xB430, 0xB530,
        0xB010, 0xB110, 0xB210, 0xB310, 0xB410, 0xB510, 0xB610, 0xB710, 0xB810, 0xB910, 0xC030, 0xC130,
        0xC230, 0xC330, 0xC430, 0xC530, 0xC010, 0xC110, 0xC210, 0xC310, 0xC410, 0xC510, 0xC610, 0xC710,
        0xC810, 0xC910, 0xD030, 0xD130, 0xD230, 0xD330, 0xD430, 0xD530, 0xD010, 0xD110, 0xD210, 0xD310,
        0xD410, 0xD510, 0xD610, 0xD710, 0xD810, 0xD910, 0xE030, 0xE130, 0xE230, 0xE330, 0xE430, 0xE530,
        0xE010, 0xE110, 0xE210, 0xE310, 0xE410, 0xE510, 0xE610, 0xE710, 0xE810, 0xE910, 0xF030, 0xF130,
        0xF230, 0xF330, 0xF430, 0xF530, 0xF010, 0xF110, 0xF210, 0xF310, 0xF410, 0xF510, 0xF610, 0xF710,
        0xF810, 0xF910, 0x00B0, 0x0130, 0x0230, 0x0330, 0x0430, 0x0530, 0x0090, 0x0110, 0x0210, 0x0310,
        0x0410, 0x0510, 0x0610, 0x0710, 0x0810, 0x0910, 0x1030, 0x1130, 0x1230, 0x1330, 0x1430, 0x1530,
        0x1010, 0x1110, 0x1210, 0x1310, 0x1410, 0x1510, 0x1610, 0x1710, 0x1810, 0x1910, 0x2030, 0x2130,
        0x2230, 0x2330, 0x2430, 0x2530, 0x2010, 0x2110, 0x2210, 0x2310, 0x2410, 0x2510, 0x2610, 0x2710,
        0x2810, 0x2910, 0x3030, 0x3130, 0x3230, 0x3330, 0x3430, 0x3530, 0x3010, 0x3110, 0x3210, 0x3310,
        0x3410, 0x3510, 0x3610, 0x3710, 0x3810, 0x3910, 0x4030, 0x4130, 0x4230, 0x4330, 0x4430, 0x4530,
        0x4010, 0x4110, 0x4210, 0x4310, 0x4410, 0x4510, 0x4610, 0x4710, 0x4810, 0x4910, 0x5030, 0x5130,
        0x5230, 0x5330, 0x5430, 0x5530, 0x5010, 0x5110, 0x5210, 0x5310, 0x5410, 0x5510, 0x5610, 0x5710,
        0x5810, 0x5910, 0x6030, 0x6130, 0x6230, 0x6330, 0x6430, 0x6530, 0x0600, 0x0700, 0x0800, 0x0900,
        0x0A00, 0x0B00, 0x0C00, 0x0D00, 0x0E00, 0x0F00, 0x1020, 0x1120, 0x1220, 0x1320, 0x1420, 0x1520,
        0x1600, 0x1700, 0x1800, 0x1900, 0x1A00, 0x1B00, 0x1C00, 0x1D00, 0x1E00, 0x1F00, 0x2020, 0x2120,
        0x2220, 0x2320, 0x2420, 0x2520, 0x2600, 0x2700, 0x2800, 0x2900, 0x2A00, 0x2B00, 0x2C00, 0x2D00,
        0x2E00, 0x2F00, 0x3020, 0x3120, 0x3220, 0x3320, 0x3420, 0x3520, 0x3600, 0x3700, 0x3800, 0x3900,
        0x3A00, 0x3B00, 0x3C00, 0x3D00, 0x3E00, 0x3F00, 0x4020, 0x4120, 0x4220, 0x4320, 0x4420, 0x4520,
        0x4600, 0x4700, 0x4800, 0x4900, 0x4A00, 0x4B00, 0x4C00, 0x4D00, 0x4E00, 0x4F00, 0x5020, 0x5120,
        0x5220, 0x5320, 0x5420, 0x5520, 0x5600, 0x5700, 0x5800, 0x5900, 0x5A00, 0x5B00, 0x5C00, 0x5D00,
        0x5E00, 0x5F00, 0x6020, 0x6120, 0x6220, 0x6320, 0x6420, 0x6520, 0x6600, 0x6700, 0x6800, 0x6900,
        0x6A00, 0x6B00, 0x6C00, 0x6D00, 0x6E00, 0x6F00, 0x7020, 0x7120, 0x7220, 0x7320, 0x7420, 0x7520,
        0x7600, 0x7700, 0x7800, 0x7900, 0x7A00, 0x7B00, 0x7C00, 0x7D00, 0x7E00, 0x7F00, 0x8020, 0x8120,
        0x8220, 0x8320, 0x8420, 0x8520, 0x8600, 0x8700, 0x8800, 0x8900, 0x8A00, 0x8B00, 0x8C00, 0x8D00,
        0x8E00, 0x8F00, 0x9020, 0x9120, 0x9220, 0x9320, 0x9420, 0x9520, 0x9600, 0x9700, 0x9800, 0x9900,
        0x9A00, 0x9B00, 0x9C00, 0x9D00, 0x9E00, 0x9F00, 0x00B0, 0x0130, 0x0230, 0x0330, 0x0430, 0x0530,
        0x0610, 0x0710, 0x0810, 0x0910, 0x0A10, 0x0B10, 0x0C10, 0x0D10, 0x0E10, 0x0F10, 0x1030, 0x1130,
        0x1230, 0x1330, 0x1430, 0x1530, 0x1610, 0x1710, 0x1810, 0x1910, 0x1A10, 0x1B10, 0x1C10, 0x1D10,
        0x1E10, 0x1F10, 0x2030, 0x2130, 0x2230, 0x2330, 0x2430, 0x2530, 0x2610, 0x2710, 0x2810, 0x2910,
        0x2A10, 0x2B10, 0x2C10, 0x2D10, 0x2E10, 0x2F10, 0x3030, 0x3130, 0x3230, 0x3330, 0x3430, 0x3530,
        0x3610, 0x3710, 0x3810, 0x3910, 0x3A10, 0x3B10, 0x3C10, 0x3D10, 0x3E10, 0x3F10, 0x4030, 0x4130,
        0x4230, 0x4330, 0x4430, 0x4530, 0x4610, 0x4710, 0x4810, 0x4910, 0x4A10, 0x4B10, 0x4C10, 0x4D10,
        0x4E10, 0x4F10, 0x5030, 0x5130, 0x5230, 0x5330, 0x5430, 0x5530, 0x5610, 0x5710, 0x5810, 0x5910,
        0x5A10, 0x5B10, 0x5C10, 0x5D10, 0x5E10, 0x5F10, 0x6030, 0x6130, 0x6230, 0x6330, 0x6430, 0x6530,
        0x6610, 0x6710, 0x6810, 0x6910, 0x6A10, 0x6B10, 0x6C10, 0x6D10, 0x6E10, 0x6F10, 0x7030, 0x7130,
        0x7230, 0x7330, 0x7430, 0x7530, 0x7610, 0x7710, 0x7810, 0x7910, 0x7A10, 0x7B10, 0x7C10, 0x7D10,
        0x7E10, 0x7F10, 0x8030, 0x8130, 0x8230, 0x8330, 0x8430, 0x8530, 0x8610, 0x8710, 0x8810, 0x8910,
        0x8A10, 0x8B10, 0x8C10, 0x8D10, 0x8E10, 0x8F10, 0x9030, 0x9130, 0x9230, 0x9330, 0x9430, 0x9530,
        0x9610, 0x9710, 0x9810, 0x9910, 0x9A10, 0x9B10, 0x9C10, 0x9D10, 0x9E10, 0x9F10, 0xA030, 0xA130,
        0xA230, 0xA330, 0xA430, 0xA530, 0xA610, 0xA710, 0xA810, 0xA910, 0xAA10, 0xAB10, 0xAC10, 0xAD10,
        0xAE10, 0xAF10, 0xB030, 0xB130, 0xB230, 0xB330, 0xB430, 0xB530, 0xB610, 0xB710, 0xB810, 0xB910,
        0xBA10, 0xBB10, 0xBC10, 0xBD10, 0xBE10, 0xBF10, 0xC030, 0xC130, 0xC230, 0xC330, 0xC430, 0xC530,
        0xC610, 0xC710, 0xC810, 0xC910, 0xCA10, 0xCB10, 0xCC10, 0xCD10, 0xCE10, 0xCF10, 0xD030, 0xD130,
        0xD230, 0xD330, 0xD430, 0xD530, 0xD610, 0xD710, 0xD810, 0xD910, 0xDA10, 0xDB10, 0xDC10, 0xDD10,
        0xDE10, 0xDF10, 0xE030, 0xE130, 0xE230, 0xE330, 0xE430, 0xE530, 0xE610, 0xE710, 0xE810, 0xE910,
        0xEA10, 0xEB10, 0xEC10, 0xED10, 0xEE10, 0xEF10, 0xF030, 0xF130, 0xF230, 0xF330, 0xF430, 0xF530,
        0xF610, 0xF710, 0xF810, 0xF910, 0xFA10, 0xFB10, 0xFC10, 0xFD10, 0xFE10, 0xFF10, 0x00B0, 0x0130,
        0x0230, 0x0330, 0x0430, 0x0530, 0x0610, 0x0710, 0x0810, 0x0910, 0x0A10, 0x0B10, 0x0C10, 0x0D10,
        0x0E10, 0x0F10, 0x1030, 0x1130, 0x1230, 0x1330, 0x1430, 0x1530, 0x1610, 0x1710, 0x1810, 0x1910,
        0x1A10, 0x1B10, 0x1C10, 0x1D10, 0x1E10, 0x1F10, 0x2030, 0x2130, 0x2230, 0x2330, 0x2430, 0x2530,
        0x2610, 0x2710, 0x2810, 0x2910, 0x2A10, 0x2B10, 0x2C10, 0x2D10, 0x2E10, 0x2F10, 0x3030, 0x3130,
        0x3230, 0x3330, 0x3430, 0x3530, 0x3610, 0x3710, 0x3810, 0x3910, 0x3A10, 0x3B10, 0x3C10, 0x3D10,
        0x3E10, 0x3F10, 0x4030, 0x4130, 0x4230, 0x4330, 0x4430, 0x4530, 0x4610, 0x4710, 0x4810, 0x4910,
        0x4A10, 0x4B10, 0x4C10, 0x4D10, 0x4E10, 0x4F10, 0x5030, 0x5130, 0x5230, 0x5330, 0x5430, 0x5530,
        0x5610, 0x5710, 0x5810, 0x5910, 0x5A10, 0x5B10, 0x5C10, 0x5D10, 0x5E10, 0x5F10, 0x6030, 0x6130,
        0x6230, 0x6330, 0x6430, 0x6530, 0x00C0, 0x0140, 0x0240, 0x0340, 0x0440, 0x0540, 0x0640, 0x0740,
        0x0840, 0x0940, 0x0440, 0x0540, 0x0640, 0x0740, 0x0840, 0x0940, 0x1040, 0x1140, 0x1240, 0x1340,
        0x1440, 0x1540, 0x1640, 0x1740, 0x1840, 0x1940, 0x1440, 0x1540, 0x1640, 0x1740, 0x1840, 0x1940,
        0x2040, 0x2140, 0x2240, 0x2340, 0x2440, 0x2540, 0x2640, 0x2740, 0x2840, 0x2940, 0x2440, 0x2540,
        0x2640, 0x2740, 0x2840, 0x2940, 0x3040, 0x3140, 0x3240, 0x3340, 0x3440, 0x3540, 0x3640, 0x3740,
        0x3840, 0x3940, 0x3440, 0x3540, 0x3640, 0x3740, 0x3840, 0x3940, 0x4040, 0x4140, 0x4240, 0x4340,
        0x4440, 0x4540, 0x4640, 0x4740, 0x4840, 0x4940, 0x4440, 0x4540, 0x4640, 0x4740, 0x4840, 0x4940,
        0x5040, 0x5140, 0x5240, 0x5340, 0x5440, 0x5540, 0x5640, 0x5740, 0x5840, 0x5940, 0x5440, 0x5540,
        0x5640, 0x5740, 0x5840, 0x5940, 0x6040, 0x6140, 0x6240, 0x6340, 0x6440, 0x6540, 0x6640, 0x6740,
        0x6840, 0x6940, 0x6440, 0x6540, 0x6640, 0x6740, 0x6840, 0x6940, 0x7040, 0x7140, 0x7240, 0x7340,
        0x7440, 0x7540, 0x7640, 0x7740, 0x7840, 0x7940, 0x7440, 0x7540, 0x7640, 0x7740, 0x7840, 0x7940,
        0x8040, 0x8140, 0x8240, 0x8340, 0x8440, 0x8540, 0x8640, 0x8740, 0x8840, 0x8940, 0x8440, 0x8540,
        0x8640, 0x8740, 0x8840, 0x8940, 0x9040, 0x9140, 0x9240, 0x9340, 0x9440, 0x9540, 0x9640, 0x9740,
        0x9840, 0x9940, 0x3450, 0x3550, 0x3650, 0x3750, 0x3850, 0x3950, 0x4050, 0x4150, 0x4250, 0x4350,
        0x4450, 0x4550, 0x4650, 0x4750, 0x4850, 0x4950, 0x4450, 0x4550, 0x4650, 0x4750, 0x4850, 0x4950,
        0x5050, 0x5150, 0x5250, 0x5350, 0x5450, 0x5550, 0x5650, 0x5750, 0x5850, 0x5950, 0x5450, 0x5550,
        0x5650, 0x5750, 0x5850, 0x5950, 0x6050, 0x6150, 0x6250, 0x6350, 0x6450, 0x6550, 0x6650, 0x6750,
        0x6850, 0x6950, 0x6450, 0x6550, 0x6650, 0x6750, 0x6850, 0x6950, 0x7050, 0x7150, 0x7250, 0x7350,
        0x7450, 0x7550, 0x7650, 0x7750, 0x7850, 0x7950, 0x7450, 0x7550, 0x7650, 0x7750, 0x7850, 0x7950,
        0x8050, 0x8150, 0x8250, 0x8350, 0x8450, 0x8550, 0x8650, 0x8750, 0x8850, 0x8950, 0x8450, 0x8550,
        0x8650, 0x8750, 0x8850, 0x8950, 0x9050, 0x9150, 0x9250, 0x9350, 0x9450, 0x9550, 0x9650, 0x9750,
        0x9850, 0x9950, 0x9450, 0x9550, 0x9650, 0x9750, 0x9850, 0x9950, 0xA050, 0xA150, 0xA250, 0xA350,
        0xA450, 0xA550, 0xA650, 0xA750, 0xA850, 0xA950, 0xA450, 0xA550, 0xA650, 0xA750, 0xA850, 0xA950,
        0xB050, 0xB150, 0xB250, 0xB350, 0xB450, 0xB550, 0xB650, 0xB750, 0xB850, 0xB950, 0xB450, 0xB550,
        0xB650, 0xB750, 0xB850, 0xB950, 0xC050, 0xC150, 0xC250, 0xC350, 0xC450, 0xC550, 0xC650, 0xC750,
        0xC850, 0xC950, 0xC450, 0xC550, 0xC650, 0xC750, 0xC850, 0xC950, 0xD050, 0xD150, 0xD250, 0xD350,
        0xD450, 0xD550, 0xD650, 0xD750, 0xD850, 0xD950, 0xD450, 0xD550, 0xD650, 0xD750, 0xD850, 0xD950,
        0xE050, 0xE150, 0xE250, 0xE350, 0xE450, 0xE550, 0xE650, 0xE750, 0xE850, 0xE950, 0xE450, 0xE550,
        0xE650, 0xE750, 0xE850, 0xE950, 0xF050, 0xF150, 0xF250, 0xF350, 0xF450, 0xF550, 0xF650, 0xF750,
        0xF850, 0xF950, 0xF450, 0xF550, 0xF650, 0xF750, 0xF850, 0xF950, 0x00D0, 0x0150, 0x0250, 0x0350,
        0x0450, 0x0550, 0x0650, 0x0750, 0x0850, 0x0950, 0x0450, 0x0550, 0x0650, 0x0750, 0x0850, 0x0950,
        0x1050, 0x1150, 0x1250, 0x1350, 0x1450, 0x1550, 0x1650, 0x1750, 0x1850, 0x1950, 0x1450, 0x1550,
        0x1650, 0x1750, 0x1850, 0x1950, 0x2050, 0x2150, 0x2250, 0x2350, 0x2450, 0x2550, 0x2650, 0x2750,
        0x2850, 0x2950, 0x2450, 0x2550, 0x2650, 0x2750, 0x2850, 0x2950, 0x3050, 0x3150, 0x3250, 0x3350,
        0x3450, 0x3550, 0x3650, 0x3750, 0x3850, 0x3950, 0x3450, 0x3550, 0x3650, 0x3750, 0x3850, 0x3950,
        0x4050, 0x4150, 0x4250, 0x4350, 0x4450, 0x4550, 0x4650, 0x4750, 0x4850, 0x4950, 0x4450, 0x4550,
        0x4650, 0x4750, 0x4850, 0x4950, 0x5050, 0x5150, 0x5250, 0x5350, 0x5450, 0x5550, 0x5650, 0x5750,
        0x5850, 0x5950, 0x5450, 0x5550, 0x5650, 0x5750, 0x5850, 0x5950, 0x6050, 0x6150, 0x6250, 0x6350,
        0x6450, 0x6550, 0x6650, 0x6750, 0x6850, 0x6950, 0x6450, 0x6550, 0x6650, 0x6750, 0x6850, 0x6950,
        0x7050, 0x7150, 0x7250, 0x7350, 0x7450, 0x7550, 0x7650, 0x7750, 0x7850, 0x7950, 0x7450, 0x7550,
        0x7650, 0x7750, 0x7850, 0x7950, 0x8050, 0x8150, 0x8250, 0x8350, 0x8450, 0x8550, 0x8650, 0x8750,
        0x8850, 0x8950, 0x8450, 0x8550, 0x8650, 0x8750, 0x8850, 0x8950, 0x9050, 0x9150, 0x9250, 0x9350,
        0x9450, 0x9550, 0x9650, 0x9750, 0x9850, 0x9950, 0x9450, 0x9550, 0x9650, 0x9750, 0x9850, 0x9950,
        0xFA60, 0xFB60, 0xFC60, 0xFD60, 0xFE60, 0xFF60, 0x00C0, 0x0140, 0x0240, 0x0340, 0x0440, 0x0540,
        0x0640, 0x0740, 0x0840, 0x0940, 0x0A60, 0x0B60, 0x0C60, 0x0D60, 0x0E60, 0x0F60, 0x1040, 0x1140,
        0x1240, 0x1340, 0x1440, 0x1540, 0x1640, 0x1740, 0x1840, 0x1940, 0x1A60, 0x1B60, 0x1C60, 0x1D60,
        0x1E60, 0x1F60, 0x2040, 0x2140, 0x2240, 0x2340, 0x2440, 0x2540, 0x2640, 0x2740, 0x2840, 0x2940,
        0x2A60, 0x2B60, 0x2C60, 0x2D60, 0x2E60, 0x2F60, 0x3040, 0x3140, 0x3240, 0x3340, 0x3440, 0x3540,
        0x3640, 0x3740, 0x3840, 0x3940, 0x3A60, 0x3B60, 0x3C60, 0x3D60, 0x3E60, 0x3F60, 0x4040, 0x4140,
        0x4240, 0x4340, 0x4440, 0x4540, 0x4640, 0x4740, 0x4840, 0x4940, 0x4A60, 0x4B60, 0x4C60, 0x4D60,
        0x4E60, 0x4F60, 0x5040, 0x5140, 0x5240, 0x5340, 0x5440, 0x5540, 0x5640, 0x5740, 0x5840, 0x5940,
        0x5A60, 0x5B60, 0x5C60, 0x5D60, 0x5E60, 0x5F60, 0x6040, 0x6140, 0x6240, 0x6340, 0x6440, 0x6540,
        0x6640, 0x6740, 0x6840, 0x6940, 0x6A60, 0x6B60, 0x6C60, 0x6D60, 0x6E60, 0x6F60, 0x7040, 0x7140,
        0x7240, 0x7340, 0x7440, 0x7540, 0x7640, 0x7740, 0x7840, 0x7940, 0x7A60, 0x7B60, 0x7C60, 0x7D60,
        0x7E60, 0x7F60, 0x8040, 0x8140, 0x8240, 0x8340, 0x8440, 0x8540, 0x8640, 0x8740, 0x8840, 0x8940,
        0x8A60, 0x8B60, 0x8C60, 0x8D60, 0x8E60, 0x8F60, 0x9040, 0x9140, 0x9240, 0x9340, 0x3450, 0x3550,
        0x3650, 0x3750, 0x3850, 0x3950, 0x3A70, 0x3B70, 0x3C70, 0x3D70, 0x3E70, 0x3F70, 0x4050, 0x4150,
        0x4250, 0x4350, 0x4450, 0x4550, 0x4650, 0x4750, 0x4850, 0x4950, 0x4A70, 0x4B70, 0x4C70, 0x4D70,
        0x4E70, 0x4F70, 0x5050, 0x5150, 0x5250, 0x5350, 0x5450, 0x5550, 0x5650, 0x5750, 0x5850, 0x5950,
        0x5A70, 0x5B70, 0x5C70, 0x5D70, 0x5E70, 0x5F70, 0x6050, 0x6150, 0x6250, 0x6350, 0x6450, 0x6550,
        0x6650, 0x6750, 0x6850, 0x6950, 0x6A70, 0x6B70, 0x6C70, 0x6D70, 0x6E70, 0x6F70, 0x7050, 0x7150,
        0x7250, 0x7350, 0x7450, 0x7550, 0x7650, 0x7750, 0x7850, 0x7950, 0x7A70, 0x7B70, 0x7C70, 0x7D70,
        0x7E70, 0x7F70, 0x8050, 0x8150, 0x8250, 0x8350, 0x8450, 0x8550, 0x8650, 0x8750, 0x8850, 0x8950,
        0x8A70, 0x8B70, 0x8C70, 0x8D70, 0x8E70, 0x8F70, 0x9050, 0x9150, 0x9250, 0x9350, 0x9450, 0x9550,
        0x9650, 0x9750, 0x9850, 0x9950, 0x9A70, 0x9B70, 0x9C70, 0x9D70, 0x9E70, 0x9F70, 0xA050, 0xA150,
        0xA250, 0xA350, 0xA450, 0xA550, 0xA650, 0xA750, 0xA850, 0xA950, 0xAA70, 0xAB70, 0xAC70, 0xAD70,
        0xAE70, 0xAF70, 0xB050, 0xB150, 0xB250, 0xB350, 0xB450, 0xB550, 0xB650, 0xB750, 0xB850, 0xB950,
        0xBA70, 0xBB70, 0xBC70, 0xBD70, 0xBE70, 0xBF70, 0xC050, 0xC150, 0xC250, 0xC350, 0xC450, 0xC550,
        0xC650, 0xC750, 0xC850, 0xC950, 0xCA70, 0xCB70, 0xCC70, 0xCD70, 0xCE70, 0xCF70, 0xD050, 0xD150,
        0xD250, 0xD350, 0xD450, 0xD550, 0xD650, 0xD750, 0xD850, 0xD950, 0xDA70, 0xDB70, 0xDC70, 0xDD70,
        0xDE70, 0xDF70, 0xE050, 0xE150, 0xE250, 0xE350, 0xE450, 0xE550, 0xE650, 0xE750, 0xE850, 0xE950,
        0xEA70, 0xEB70, 0xEC70, 0xED70, 0xEE70, 0xEF70, 0xF050, 0xF150, 0xF250, 0xF350, 0xF450, 0xF550,
        0xF650, 0xF750, 0xF850, 0xF950, 0xFA70, 0xFB70, 0xFC70, 0xFD70, 0xFE70, 0xFF70, 0x00D0, 0x0150,
        0x0250, 0x0350, 0x0450, 0x0550, 0x0650, 0x0750, 0x0850, 0x0950, 0x0A70, 0x0B70, 0x0C70, 0x0D70,
        0x0E70, 0x0F70, 0x1050, 0x1150, 0x1250, 0x1350, 0x1450, 0x1550, 0x1650, 0x1750, 0x1850, 0x1950,
        0x1A70, 0x1B70, 0x1C70, 0x1D70, 0x1E70, 0x1F70, 0x2050, 0x2150, 0x2250, 0x2350, 0x2450, 0x2550,
        0x2650, 0x2750, 0x2850, 0x2950, 0x2A70, 0x2B70, 0x2C70, 0x2D70, 0x2E70, 0x2F70, 0x3050, 0x3150,
        0x3250, 0x3350, 0x3450, 0x3550, 0x3650, 0x3750, 0x3850, 0x3950, 0x3A70, 0x3B70, 0x3C70, 0x3D70,
        0x3E70, 0x3F70, 0x4050, 0x4150, 0x4250, 0x4350, 0x4450, 0x4550, 0x4650, 0x4750, 0x4850, 0x4950,
        0x4A70, 0x4B70, 0x4C70, 0x4D70, 0x4E70, 0x4F70, 0x5050, 0x5150, 0x5250, 0x5350, 0x5450, 0x5550,
        0x5650, 0x5750, 0x5850, 0x5950, 0x5A70, 0x5B70, 0x5C70, 0x5D70, 0x5E70, 0x5F70, 0x6050, 0x6150,
        0x6250, 0x6350, 0x6450, 0x6550, 0x6650, 0x6750, 0x6850, 0x6950, 0x6A70, 0x6B70, 0x6C70, 0x6D70,
        0x6E70, 0x6F70, 0x7050, 0x7150, 0x7250, 0x7350, 0x7450, 0x7550, 0x7650, 0x7750, 0x7850, 0x7950,
        0x7A70, 0x7B70, 0x7C70, 0x7D70, 0x7E70, 0x7F70, 0x8050, 0x8150, 0x8250, 0x8350, 0x8450, 0x8550,
        0x8650, 0x8750, 0x8850, 0x8950, 0x8A70, 0x8B70, 0x8C70, 0x8D70, 0x8E70, 0x8F70, 0x9050, 0x9150,
        0x9250, 0x9350, 0x9450, 0x9550, 0x9650, 0x9750, 0x9850, 0x9950];
}
