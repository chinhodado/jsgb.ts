///<reference path="Utils.ts"/>
///<reference path="Debugger.ts"/>
///<reference path="Interrupts.ts"/>
/**
 * Main implementation of the Gameboy
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

var gbRunInterval;
var gbFpsInterval;

var gbSeconds = 0;
var gbFrames = 0;

function gb_Resize_LCD() {
    var resizeButton = <HTMLButtonElement>$('BX');
    var lcd = <HTMLCanvasElement>$('LCD');
    if (resizeButton.value == 'Size x2') {
        resizeButton.value = 'Size x3';
        lcd.style.width  = '320px';
        lcd.style.height = '288px';
    }
    else if (resizeButton.value == 'Size x3') {
        resizeButton.value = 'Size x1';
        lcd.style.width  = '480px';
        lcd.style.height = '432px';
    }
    else {
        resizeButton.value = 'Size x2';
        lcd.style.width  = '160px';
        lcd.style.height = '144px';
    }
}

function gb_Show_Fps() {
    gbFrames += gbFPS;
    gbSeconds++;
    $('STATUS').innerHTML =
    'Running: ' + gbFPS + ' ' +
    'fps - Average: ' + (gbFrames / gbSeconds).toFixed(2) + ' - ' +
    'Bank switches/s: ' + gbBankSwitchCount;
    gbFPS = 0;
    gbBankSwitchCount = 0;
}

function gb_Toggle_Debugger(show) {
    $('DEBUGGER').style.height = (show) ? 'auto' : '0px';
}

window.onload = function () {
    gb_Insert_Cartridge((<HTMLSelectElement>$('CARTRIDGE')).value, false);
    gb_Toggle_Debugger((<HTMLInputElement>$('TOGGLE_DEBUGGER')).checked);
}

function gb_Frame() {
    gbEndFrame = false;
    while (!(gbEndFrame || cpu.pause)) {
        if (!cpu.halt) cpu.OP[MEMR(cpu.PC++)](); else cpu.cpuTicks = 4;
        if (cpu.gbIME) gbInterrupts[gbRegIE & gbRegIF]();
        gb_TIMER_Control();
        if (gbIsBreakpoint) if (gbBreakpointsList.indexOf(cpu.PC) >= 0) {
            gb_Pause();
            gb_Toggle_Debugger(true);
        }
    }
}

function gb_Step() {
    if (!cpu.halt) cpu.OP[MEMR(cpu.PC++)](); else cpu.cpuTicks = 4;
    if (cpu.gbIME) gbInterrupts[gbRegIE & gbRegIF]();
    gb_TIMER_Control();
    gb_Dump_All();
}

function gb_Run() {
    if (!cpu.pause) return;
    cpu.pause = false;
    $('BR').disabled = true;
    $('BP').disabled = false;
    $('BS').disabled = true;
    gbFpsInterval = setInterval(gb_Show_Fps, 1000);
    gbRunInterval = setInterval(gb_Frame, 16);
}

function gb_Pause() {
    if (cpu.pause) return;
    cpu.pause = true;
    $('BR').disabled = false;
    $('BP').disabled = true;
    $('BS').disabled = false;
    clearInterval(gbRunInterval);
    clearInterval(gbFpsInterval);
    $('STATUS').innerHTML = 'Pause';
    gb_Dump_All();
}

var cpu: CPU;

function gb_Insert_Cartridge(fileName, Start) {
    cpu = new CPU();
    gb_Pause();
    gbSeconds = 0;
    gbFrames = 0;
    gb_Init_Debugger();
    gb_Init_Memory();
    gb_Init_LCD();
    gb_Init_Interrupts();
    cpu.gb_Init_CPU();
    gb_Init_Input();
    gb_ROM_Load('roms/' + fileName);
    gb_Dump_All();
    var br: any = $('BR'), bp: any = $('BP');
    if (Start) br.onclick();
    else bp.onclick();
}
