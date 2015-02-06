///<reference path="Input.ts"/>
///<reference path="LCD.ts"/>
///<reference path="Rom.ts"/>
///<reference path="Timers.ts"/>
/**
 * Memory module
 * Part of gameboy.ts - a TypeScript GameBoy Emulator
 *
 * Copyright (C) 2015 Chin <chin.bimbo@gmail.com>
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

class Memory {
    gbMemory = new Array(0x10000);

    // special register mirror values and bit states
    gbRegLY = 0;
    gbRegLYC = 0;
    gbRegSCY = 0;
    gbRegSCX = 0;
    gbRegWY = 0;
    gbRegWX = 0;
    gbRegDIV = 0;
    gbRegIF = 0;
    gbRegIE = 0;
    gbRegSTAT_Mode = 0;
    gbRegSTAT_IntLYLYC = false;
    gbRegSTAT_IntMode2 = false;
    gbRegSTAT_IntMode1 = false;
    gbRegSTAT_IntMode0 = false;

    gbRegLCDC_DisplayOn = false;
    gbRegLCDC_WindowYOffs = 0;
    gbRegLCDC_WindowDisplay = false;
    gbRegLCDC_SpriteDisplay = false;
    gbRegLCDC_SpriteSize = 0;
    gbRegLCDC_BackgroundYOffs = 0;
    gbRegLCDC_BackgroundXOffs = 0;
    gbRegLCDC_BgAndWinDisplay = false;
    gbRegTAC_TimerOn = false;

    // special register addresses
    _P1_ = 0xFF00;
    _SC_ = 0xFF02;
    _DIV_ = 0xFF04;
    _TIMA_ = 0xFF05;
    _TMA_ = 0xFF06;
    _TAC_ = 0xFF07;
    _IF_ = 0xFF0F;
    _LCDC_ = 0xFF40;
    _STAT_ = 0xFF41;
    _SCY_ = 0xFF42;
    _SCX_ = 0xFF43;
    _LY_ = 0xFF44;
    _LYC_ = 0xFF45;
    _DMA_ = 0xFF46;
    _BGP_ = 0xFF47;
    _OBP0_ = 0xFF48;
    _OBP1_ = 0xFF49;
    _WY_ = 0xFF4A;
    _WX_ = 0xFF4B;
    _IE_ = 0xFFFF;

    // start addresses
    _ROM0_ = 0x0000;
    _ROM1_ = 0x4000;
    _VRAM_ = 0x8000; // video RAM
    _BTD0_ = 0x8000; // backgroun tile data 0
    _BTD1_ = 0x8800; // backgroun tile data 1
    _BTM0_ = 0x9800; // background tile map 0
    _BTM1_ = 0x9C00; // background tile map 1
    _RAM1_ = 0xA000; // switchable RAM
    _RAM0_ = 0xC000; // internal RAM
    _ECHO_ = 0xE000; // echo of internal RAM
    _OAM_  = 0xFE00; // object attribute

    gb_Memory_Read_ROM_Only(a) {
        return this.gbMemory[a];
    }

    gb_Memory_Read_MBC1_ROM(a) {
        switch (a >> 12) {
            case 0:
            case 1:
            case 2:
            case 3:
                return this.gbMemory[a];
            case 4:
            case 5:
            case 6:
            case 7:
                return gbROM[gbROMBank1offs + a];
            default:
                return this.gbMemory[a];
        }
    }

    MEMR = this.gb_Memory_Read_ROM_Only;

    MEMW(a, v) {
        // Special registers+HRAM
        if (a >= 0xFF00) {
            switch (a & 0xFF) {
                case 0x00: // FF00 P1 Joypad
                    //if(v==3)gbMemory[a]=0xF0; else // Fx->GB/GBP; 3x->SGB
                    gb_Read_Joypad(v);
                    return;
                case 0x02: // FF02 SC
                    this.gbMemory[0xFF02] = 0;
                    return;
                case 0x04: // FF04 DIV
                    this.gbMemory[0xFF04] = 0; // Writing any value sets it to 0.
                    return;
                case 0x07: // FF07 TAC - TIMER CONTROL
                    this.gbMemory[0xFF07] = v;
                    this.gbRegTAC_TimerOn = ((v & 4) != 0);
                    gb_Set_Timer_Freq(v & 3);
                    return;
                case 0x0F: // FF0F IF - Interrupt Flags
                    this.gbMemory[0xFF0F] = this.gbRegIF = (v & 31);
                    return;
                case 0x40: // FF40 LCDC
                    var i = ((v >> 7) != 0);
                    if (i != this.gbRegLCDC_DisplayOn) {
                        // TODO not sure on this
                        this.gbMemory[this._LY_] = this.gbRegLY = gbLCDTicks = 0;
                        //if (!i) gb_Clear_Framebuffer();
                    }
                    this.gbRegLCDC_DisplayOn = i;
                    this.gbRegLCDC_WindowYOffs = (v & 64) ? 256 : 0;
                    this.gbRegLCDC_WindowDisplay = (v & 32) ? true : false;
                    this.gbRegLCDC_BackgroundXOffs = (v & 16) ? 0 : 256;
                    this.gbRegLCDC_BackgroundYOffs = (v & 8) ? 256 : 0;
                    this.gbRegLCDC_SpriteSize = (v & 4) ? 16 : 8;
                    this.gbRegLCDC_SpriteDisplay = (v & 2) ? true : false;
                    this.gbRegLCDC_BgAndWinDisplay = (v & 1) ? true : false;
                    this.gbMemory[0xFF40] = v;
                    return;
                case 0x41: // FF41 STAT
                    this.gbRegSTAT_Mode = v & 3;
                    this.gbRegSTAT_IntLYLYC = (v & 64) ? true : false;
                    this.gbRegSTAT_IntMode2 = (v & 32) ? true : false;
                    this.gbRegSTAT_IntMode1 = (v & 16) ? true : false;
                    this.gbRegSTAT_IntMode0 = (v & 8) ? true : false;
                    this.gbMemory[0xFF41] = v;
                    return;
                case 0x42: // FF42 SCY
                    this.gbMemory[0xFF42] = this.gbRegSCY = v;
                    return;
                case 0x43: // FF43 SCX
                    this.gbMemory[0xFF43] = this.gbRegSCX = v;
                    return;
                case 0x44: // FF44 LY
                    this.gbMemory[0xFF44] = this.gbRegLY = 0; // Writing any value sets it to 0.
                    return;
                case 0x45: // FF45 LYC
                    this.gbMemory[0xFF45] = this.gbRegLYC = v;
                    return;
                case 0x46: // FF46 DMA TRANSFER
                    v = v << 8; // start address of DMA
                    a = 0xFE00; // OAM addr
                    while (a < 0xFEA0) this.gbMemory[a++] = this.MEMR(v++);
                    return;
                case 0x47: // FF47 BGP - Background Palette
                    this.gbMemory[0xFF47] = v;
                    gbBackPal[0] = v & 3;
                    gbBackPal[1] = (v >> 2) & 3;
                    gbBackPal[2] = (v >> 4) & 3;
                    gbBackPal[3] = (v >> 6) & 3;
                    return;
                case 0x48: // FF48 OBP0 - Sprite Palette 0
                    this.gbMemory[0xFF48] = v;
                    gbSpritePal[0][0] = v & 3;
                    gbSpritePal[0][1] = (v >> 2) & 3;
                    gbSpritePal[0][2] = (v >> 4) & 3;
                    gbSpritePal[0][3] = (v >> 6) & 3;
                    return;
                case 0x49: // FF49 OBP1 - Sprite Palette 1
                    this.gbMemory[0xFF49] = v;
                    gbSpritePal[1][0] = v & 3;
                    gbSpritePal[1][1] = (v >> 2) & 3;
                    gbSpritePal[1][2] = (v >> 4) & 3;
                    gbSpritePal[1][3] = (v >> 6) & 3;
                    return;
                case 0x4A: // FF4A WY
                    this.gbMemory[0xFF4A] = this.gbRegWY = v;
                    return;
                case 0x4B: // FF4B WX
                    this.gbMemory[0xFF4B] = this.gbRegWX = v;
                    return;
                case 0xFF: // FFFF IE - Interrupt Enable
                    this.gbMemory[0xFFFF] = this.gbRegIE = (v & 31);
                    return;
                default: // THE OTHERS
                    this.gbMemory[a] = v;
                    return;
            }
        }
        // writing to ROM?
        else if (a < 0x8000) {
            switch (gbCartridgeType) {
                case _ROM_ONLY_:
                    return;

                case _ROM_MBC1_:
                    switch (a >> 12) {
                        // write to 2000-3FFF: select ROM bank
                        case 2:
                        case 3:
                            //$('STATUS').innerHTML='Select ROM Bank: '+(v&31);
                            gbROMBankSwitch(v & 31);
                            return;
                        // write to 6000-7FFF: select MBC1 mode
                        case 6:
                        case 7:
                            gbMBC1Mode = v & 1;
                            return;
                        // unhandled cases
                        default:
                            //$('STATUS').innerHTML='Unhandled MBC1 ROM write:\naddr: '+hex4(a)+' - val: '+hex2(v);
                            return;
                    }
                default:
                    alert('Unknown Memory Bank Controller.\naddr: ' + hex4(a) + ' - val: ' + hex2(v));
                    gb_Pause();
                    return;
            }
        }
        // make changes if the new value is different
        else if (this.gbMemory[a] != v) {
            // 8000-97FF: Tile data
            if (a < 0x9800) {
                gbUpdateTiles = true;
                gbUpdateTilesList[(a - 0x8000) >> 4] = true;
                this.gbMemory[a] = v;
            }
            // 9800-9FFF: Tile maps
            else if (a < 0xA000) {
                gbUpdateBackground = true;
                gbUpdateBackgroundTileList[a - 0x9800] = true;
                this.gbMemory[a] = v;
            }
            // A000-BFFF: Switchable RAM
            else if (a < 0xC000) {
                this.gbMemory[a] = v;
            }
            // C000-DFFF: Internal RAM
            else if (a < 0xE000) {
                this.gbMemory[a] = v;
                // C000-DDFF: Writes to ECHO
                if (a < 0xDE00) this.gbMemory[a + 0x2000] = v;
            }
            // E000-FDFF: ECHO
            else if (a < 0xFE00) {
                this.gbMemory[a] = v;
                this.gbMemory[a - 0x2000] = v;
            }
            else this.gbMemory[a] = v;
        }
    }

    where_mem(a) { // TODO rewrite this
        if (a < 0x4000) return 'ROM0';
        else if (a < 0x8000) return 'ROM1';
        else if (a < 0xA000) return 'VRAM';
        else if (a < 0xC000) return 'RAM1';
        else if (a < 0xE000) return 'RAM0';
        else if (a < 0xFE00) return 'ECHO';
        else if (a < 0xFEA0) return 'OAM&nbsp;';
        else if (a < 0xFF00) return 'I/O&nbsp;';
        else if (a < 0xFF4C) return 'I/O&nbsp;';
        else if (a < 0xFF80) return 'I/O&nbsp;';
        else if (a < 0xFFFF) return 'HRAM';
        else if (a == 0xFFFF) return 'IE&nbsp;&nbsp;'; //TODO: chin - check this
        else return '&nbsp;&nbsp;&nbsp;&nbsp;';
    }

    gb_Init_Memory() {
        var i = 0x100000;
        while (i) {
            this.gbMemory[--i] = 0;
            this.gbMemory[--i] = 0;
            this.gbMemory[--i] = 0;
            this.gbMemory[--i] = 0;
        }
        this.MEMW(0xFF00, 0xFF); // P1
        this.MEMW(0xFF04, 0xAF); // DIV
        this.MEMW(0xFF05, 0x00); // TIMA
        this.MEMW(0xFF06, 0x00); // TMA
        this.MEMW(0xFF07, 0xF8); // TAC
        this.MEMW(0xFF0F, 0x00); // IF
        this.MEMW(0xFF10, 0x80); // NR10
        this.MEMW(0xFF11, 0xBF); // NR11
        this.MEMW(0xFF12, 0xF3); // NR12
        this.MEMW(0xFF14, 0xBF); // NR14
        this.MEMW(0xFF16, 0x3F); // NR21
        this.MEMW(0xFF17, 0x00); // NR22
        this.MEMW(0xFF19, 0xBF); // NR24
        this.MEMW(0xFF1A, 0x7F); // NR30
        this.MEMW(0xFF1B, 0xFF); // NR31
        this.MEMW(0xFF1C, 0x9F); // NR32
        this.MEMW(0xFF1E, 0xBF); // NR33
        this.MEMW(0xFF20, 0xFF); // NR41
        this.MEMW(0xFF21, 0x00); // NR42
        this.MEMW(0xFF22, 0x00); // NR43
        this.MEMW(0xFF23, 0xBF); // NR30
        this.MEMW(0xFF24, 0x77); // NR50
        this.MEMW(0xFF25, 0xF3); // NR51
        this.MEMW(0xFF26, 0xF1); // NR52 0xF1->GB; 0xF0->SGB
        this.MEMW(0xFF40, 0x91); // LCDC
        this.MEMW(0xFF42, 0x00); // SCY
        this.MEMW(0xFF43, 0x00); // SCX
        this.MEMW(0xFF44, 0x00); // LY
        this.MEMW(0xFF45, 0x00); // LYC
        this.MEMW(0xFF47, 0xFC); // BGP
        this.MEMW(0xFF48, 0xFF); // OBP0
        this.MEMW(0xFF49, 0xFF); // OBP1
        this.MEMW(0xFF4A, 0x00); // WY
        this.MEMW(0xFF4B, 0x00); // WX
        this.MEMW(0xFFFF, 0x00); // IE
    }
}
