///<reference path="toolbox.ts"/>
///<reference path="jsgb.debugger.ts"/>
///<reference path="jsgb.interrupts.ts"/>

declare var gb_Toggle_Debugger; // in index.htm
declare var gb_Show_Fps;
declare var gbSeconds;
declare var gbFrames;

var gbRunInterval;
var gbFpsInterval;

function gb_Frame() {
    gbEndFrame = false;
    while (!(gbEndFrame || gbPause)) {
        if (!gbHalt) OP[MEMR(PC++)](); else gbCPUTicks = 4;
        if (gbIME) gbInterrupts[gbRegIE & gbRegIF]();
        gb_TIMER_Control();
        if (gbIsBreakpoint) if (gbBreakpointsList.indexOf(PC) >= 0) {
            gb_Pause();
            gb_Toggle_Debugger(true);
        }
    }
}

function gb_Step() {
    if (!gbHalt) OP[MEMR(PC++)](); else gbCPUTicks = 4;
    if (gbIME) gbInterrupts[gbRegIE & gbRegIF]();
    gb_TIMER_Control();
    gb_Dump_All();
}

function gb_Run() {
    if (!gbPause) return;
    gbPause = false;
    $('BR').disabled = true;
    $('BP').disabled = false;
    $('BS').disabled = true;
    gbFpsInterval = setInterval(gb_Show_Fps, 1000);
    gbRunInterval = setInterval(gb_Frame, 16);
}

function gb_Pause() {
    if (gbPause) return;
    gbPause = true;
    $('BR').disabled = false;
    $('BP').disabled = true;
    $('BS').disabled = false;
    clearInterval(gbRunInterval);
    clearInterval(gbFpsInterval);
    $('STATUS').innerHTML = 'Pause';
    gb_Dump_All();
}

function gb_Insert_Cartridge(fileName, Start) {
    gb_Pause();
    gbSeconds = 0;
    gbFrames = 0;
    gb_Init_Debugger();
    gb_Init_Memory();
    gb_Init_LCD();
    gb_Init_Interrupts();
    gb_Init_CPU();
    gb_Init_Input();
    gb_ROM_Load('roms/' + fileName);
    gb_Dump_All();
    var br: any = $('BR'), bp: any = $('BP');
    if (Start) br.onclick();
    else bp.onclick();
}
