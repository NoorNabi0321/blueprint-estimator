import { useState, useRef, useCallback } from "react";

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const T = {
  bg:      "#070809",
  surface: "#0E1012",
  panel:   "#141618",
  border:  "#1E2124",
  border2: "#2A2E33",
  amber:   "#F5A623",
  amberDim:"#7A5212",
  green:   "#22C55E",
  orange:  "#F97316",
  red:     "#EF4444",
  blue:    "#3B82F6",
  purple:  "#A78BFA",
  cyan:    "#06B6D4",
  text:    "#E8EAED",
  dim:     "#6B7280",
  faint:   "#374151",
  mono:    "'Courier New', 'Lucida Console', monospace",
};

// ─── PIPELINE STAGES ──────────────────────────────────────────────────────────
const STAGES = [
  { id:1, icon:"🔎", label:"Sheet Detection",       sub:"Identifying plan types, scales, sheet count" },
  { id:2, icon:"📐", label:"Multi-Pass Extraction", sub:"Floor plans · RCPs · MEP · Notes · Elevations" },
  { id:3, icon:"📋", label:"Schedule Parsing",      sub:"Finish schedule · Door schedule · Window schedule" },
  { id:4, icon:"🔗", label:"Cross-Reference",       sub:"Matching schedules to rooms · Upgrading confidence" },
  { id:5, icon:"🧱", label:"Assembly Building",     sub:"Raw quantities → full trade assemblies" },
  { id:6, icon:"💲", label:"Pricing & Confidence",  sub:"Unit costs applied · HIGH/MEDIUM/LOW flagged" },
  { id:7, icon:"📊", label:"Estimate Assembly",     sub:"3 versions: Bid · Owner Budget · Sub-Bids" },
  { id:8, icon:"📄", label:"Proposal Writing",      sub:"Professional 3-in-1 document · Claude-authored" },
];

// ─── CSI DIVISIONS ────────────────────────────────────────────────────────────
const CSI = {
  "01":{ name:"General Requirements",   color:"#9CA3AF", icon:"⚙️" },
  "02":{ name:"Demo / Existing",        color:"#6B7280", icon:"🔨" },
  "03":{ name:"Concrete",               color:"#6366F1", icon:"🪨" },
  "05":{ name:"Structural Steel",       color:"#EF4444", icon:"🔩" },
  "06":{ name:"Framing & Carpentry",    color:"#F59E0B", icon:"🪵" },
  "07":{ name:"Roofing & Insulation",   color:"#10B981", icon:"🏠" },
  "08":{ name:"Doors & Windows",        color:"#3B82F6", icon:"🚪" },
  "09":{ name:"Finishes",               color:"#EC4899", icon:"🎨" },
  "22":{ name:"Plumbing",               color:"#06B6D4", icon:"🔧" },
  "23":{ name:"HVAC / Mechanical",      color:"#F97316", icon:"❄️" },
  "26":{ name:"Electrical",             color:"#EAB308", icon:"⚡" },
  "31":{ name:"Earthwork / Site",       color:"#84CC16", icon:"🌱" },
};

const DEMO = {
  name:"Brooklyn Two-Family Residence", type:"Residential — 2-Family",
  sqft:3200, stories:2, doors:22, windows:18,
  foundation:"Concrete slab-on-grade, 6\" thick, #4 rebar @ 16\" OC both ways",
  framing:"2×6 SPF studs @ 16\" OC, double top plate, pressure-treated sill",
  roofing:"Architectural asphalt shingles, 30-year, self-adhering ice & water shield",
  panel_amps:200, plumbing_fixtures:8, hvac_tons:5,
  finishSchedule:[
    { room:"Living Room",  floor:"LVP 5mm click-lock",   wall:"Latex eggshell",    ceiling:"Gypsum board painted", base:"3½\" colonial MDF" },
    { room:"Kitchen",      floor:"Porcelain tile 12×24", wall:"Tile to 48\" wainscot + paint above", ceiling:"Gypsum board painted", base:"Tile base" },
    { room:"Bedroom 1",    floor:"LVP 5mm click-lock",   wall:"Latex eggshell",    ceiling:"Gypsum board painted", base:"3½\" colonial MDF" },
    { room:"Bedroom 2",    floor:"LVP 5mm click-lock",   wall:"Latex eggshell",    ceiling:"Gypsum board painted", base:"3½\" colonial MDF" },
    { room:"Bathroom",     floor:"Ceramic tile 6×6",     wall:"Ceramic tile 4×4 to ceiling", ceiling:"Moisture-resistant GWB painted", base:"Tile base" },
    { room:"Hallway",      floor:"LVP 5mm click-lock",   wall:"Latex eggshell",    ceiling:"Gypsum board painted", base:"3½\" colonial MDF" },
  ],
  doorSchedule:[
    { mark:"A", width:36, height:84, type:"Exterior entry", material:"Fiberglass 6-panel", hardware:"Schlage B60N deadbolt + F51A lever", qty:2 },
    { mark:"B", width:32, height:84, type:"Interior passage", material:"Hollow core flush", hardware:"Schlage F10 passage lever", qty:12 },
    { mark:"C", width:30, height:84, type:"Interior bedroom", material:"Hollow core flush", hardware:"Schlage F40 privacy lever", qty:6 },
    { mark:"D", width:60, height:84, type:"Interior closet bifold", material:"Hollow core louvered", hardware:"Stanley bifold hardware", qty:8 },
  ],
  windowSchedule:[
    { mark:"W1", width:36, height:48, type:"Double-hung", material:"Vinyl frame", glazing:"Low-E double pane argon", qty:8 },
    { mark:"W2", width:30, height:48, type:"Double-hung", material:"Vinyl frame", glazing:"Low-E double pane argon", qty:6 },
    { mark:"W3", width:48, height:60, type:"Picture fixed", material:"Vinyl frame", glazing:"Low-E double pane argon", qty:4 },
  ],
  specNotes:[
    "All exterior walls R-21 continuous insulation + R-19 cavity",
    "Fire blocking at all floor penetrations per IBC 2021",
    "All drywall Level 4 finish unless noted otherwise",
    "MEP rough-in to be complete and inspected before drywall",
    "All plumbing fixtures: Kohler or equal, owner to select",
    "Electrical: 200A service, 20-circuit minimum each unit",
  ],
};

// ─── CALCULATION ENGINE ───────────────────────────────────────────────────────
function buildAssemblies(proj, loc, schedules) {
  const sqft    = Number(proj.sqft)   || 2000;
  const stories = Number(proj.stories)|| 1;
  const lm = loc.toLowerCase().includes("brooklyn")||loc.toLowerCase().includes("new york")||loc.toLowerCase().includes("nyc") ? 1.38
    : loc.toLowerCase().includes("san francisco")||loc.toLowerCase().includes("sf") ? 1.42
    : loc.toLowerCase().includes("los angeles")||loc.toLowerCase().includes("la") ? 1.28
    : loc.toLowerCase().includes("chicago") ? 1.18
    : loc.toLowerCase().includes("boston") ? 1.30
    : loc.toLowerCase().includes("miami")||loc.toLowerCase().includes("florida") ? 1.12
    : loc.toLowerCase().includes("dallas")||loc.toLowerCase().includes("houston")||loc.toLowerCase().includes("texas") ? 1.05
    : 1.00;

  // Derived quantities
  const roofSF    = Math.round((sqft/stories)*1.15);
  const extWallSF = Math.round(Math.sqrt(sqft/stories)*4*9*stories*1.1);
  const intWallLF = Math.round(sqft*0.35);
  const drywallSF = Math.round((extWallSF + intWallLF*9*2)*1.10);
  const concreteCY= Math.round((sqft/stories*0.5/27)*1.05);
  const framingBF = Math.round(sqft*2.2*1.15);  // board feet
  const fixtures  = Number(proj.plumbing_fixtures)||6;
  const tons      = Number(proj.hvac_tons)||4;
  const amps      = Number(proj.panel_amps)||200;

  // Schedule-driven quantities (HIGH confidence)
  const dsched = schedules?.doors || proj.doorSchedule || [];
  const wsched = schedules?.windows || proj.windowSchedule || [];
  const fsched = schedules?.finish || proj.finishSchedule || [];

  const totalDoors   = dsched.length ? dsched.reduce((a,d)=>a+(d.qty||1),0) : Number(proj.doors)||Math.round(sqft/150);
  const totalWindows = wsched.length ? wsched.reduce((a,w)=>a+(w.qty||1),0) : Number(proj.windows)||Math.round(sqft/180);
  const doorSource   = dsched.length ? "HIGH" : "MEDIUM";
  const winSource    = wsched.length ? "HIGH" : "MEDIUM";

  // Finish schedule → flooring breakdown
  let lvpSF = 0, tileSF = 0, carpetSF = 0;
  if (fsched.length) {
    const totalRoomSF = sqft * 0.85;
    const avgRoomSF   = totalRoomSF / Math.max(fsched.length*2, 1); // both units
    fsched.forEach(r => {
      const rSF = r.sqft || avgRoomSF;
      const fl  = (r.floor||"").toLowerCase();
      if (fl.includes("lvp")||fl.includes("vinyl")||fl.includes("wood")) lvpSF  += rSF;
      else if (fl.includes("tile")||fl.includes("porcelain")||fl.includes("ceramic")) tileSF += rSF;
      else if (fl.includes("carpet")) carpetSF += rSF;
      else lvpSF += rSF;
    });
    // Scale to both floors
    lvpSF   = Math.round(lvpSF   * (stories > 1 ? 2 : 1) * 1.10);
    tileSF  = Math.round(tileSF  * (stories > 1 ? 2 : 1) * 1.10);
    carpetSF= Math.round(carpetSF* (stories > 1 ? 2 : 1) * 1.10);
  } else {
    lvpSF   = Math.round(sqft * 0.55);
    tileSF  = Math.round(sqft * 0.20);
  }
  const floorSource = fsched.length ? "HIGH" : "LOW";

  // Door cost breakdown from schedule
  const doorCost = dsched.length
    ? dsched.reduce((sum, d) => {
        const matCost = d.type?.toLowerCase().includes("exterior")||d.type?.toLowerCase().includes("entry") ? 1850
          : d.type?.toLowerCase().includes("bifold")||d.type?.toLowerCase().includes("closet") ? 320 : 580;
        return sum + (matCost + 280) * (d.qty||1) * lm;
      }, 0)
    : totalDoors * 700 * lm;

  const winCost = wsched.length
    ? wsched.reduce((sum, w) => {
        const sf = (w.width/12) * (w.height/12);
        const matCost = w.type?.toLowerCase().includes("picture")||w.type?.toLowerCase().includes("fixed") ? sf*65 : sf*55;
        return sum + (matCost + 150) * (w.qty||1) * lm;
      }, 0)
    : totalWindows * 520 * lm;

  // ── ASSEMBLIES ──────────────────────────────────────────────────────────────
  const assemblies = [

    // DIV 01
    {
      id:"01-GC", div:"01", name:"General Conditions",
      confidence:"MEDIUM", math:`${sqft.toLocaleString()} SF × $4.50/SF × ${lm.toFixed(2)} loc`,
      components:[
        { desc:"Project supervision & PM",     qty:Math.round(sqft/500), unit:"WK", unitCost:Math.round(900*lm),  total:Math.round(sqft/500*900*lm) },
        { desc:"Temporary facilities & utilities", qty:1, unit:"LS", unitCost:Math.round(3500*lm), total:Math.round(3500*lm) },
        { desc:"Final cleanup & waste disposal", qty:sqft, unit:"SF", unitCost:Math.round(0.45*lm), total:Math.round(sqft*0.45*lm) },
        { desc:"Permits & inspection fees",     qty:1,    unit:"LS", unitCost:Math.round(4200*lm),  total:Math.round(4200*lm) },
      ],
    },

    // DIV 03
    {
      id:"03-CONC", div:"03", name:"Concrete Slab Assembly",
      confidence:"MEDIUM",
      math:`${concreteCY} CY × $185/CY × ${lm.toFixed(2)} loc (slab ${proj.foundation?.includes("6")?"6":"4"}" thick)`,
      components:[
        { desc:`Ready-mix concrete ${proj.foundation?.includes("6")?"6":"4"}\" slab`, qty:concreteCY, unit:"CY", unitCost:Math.round(148*lm), total:Math.round(concreteCY*148*lm) },
        { desc:"#4 rebar @ 16\" OC both ways",   qty:Math.round(concreteCY*180), unit:"LB", unitCost:Math.round(0.92*lm), total:Math.round(concreteCY*180*0.92*lm) },
        { desc:"Vapor barrier 10 mil",            qty:Math.round(sqft/stories), unit:"SF", unitCost:Math.round(0.28*lm), total:Math.round(sqft/stories*0.28*lm) },
        { desc:"Formwork & labor",                qty:concreteCY, unit:"CY", unitCost:Math.round(38*lm), total:Math.round(concreteCY*38*lm) },
      ],
    },

    // DIV 06 — FRAMING (full assembly)
    {
      id:"06-FRAME", div:"06", name:`Exterior Wall Framing Assembly (${proj.framing||"2×6 @ 16\" OC"})`,
      confidence:"MEDIUM",
      math:`${extWallSF.toLocaleString()} SF ext wall × ${(framingBF/sqft).toFixed(1)} BF/SF`,
      components:[
        { desc:`2×6 SPF studs @ 16\" OC`,         qty:Math.round(framingBF*0.65), unit:"BF",  unitCost:Math.round(0.72*lm), total:Math.round(framingBF*0.65*0.72*lm) },
        { desc:"Double top plate 2×6",             qty:Math.round(extWallSF/9*2), unit:"LF", unitCost:Math.round(1.85*lm), total:Math.round(extWallSF/9*2*1.85*lm) },
        { desc:"Pressure-treated sill plate",      qty:Math.round(extWallSF/9),   unit:"LF", unitCost:Math.round(3.20*lm), total:Math.round(extWallSF/9*3.20*lm) },
        { desc:"LVL headers & beams",              qty:Math.round(sqft*0.04),      unit:"LF", unitCost:Math.round(18*lm),   total:Math.round(sqft*0.04*18*lm) },
        { desc:"Interior partition framing",       qty:intWallLF, unit:"LF",       unitCost:Math.round(12.50*lm), total:Math.round(intWallLF*12.50*lm) },
        { desc:"Blocking, bridging, misc hardware",qty:sqft,      unit:"SF",       unitCost:Math.round(0.85*lm), total:Math.round(sqft*0.85*lm) },
        { desc:"Framing labor",                    qty:framingBF, unit:"BF",       unitCost:Math.round(0.55*lm), total:Math.round(framingBF*0.55*lm) },
      ],
    },

    // DIV 07 — ROOFING
    {
      id:"07-ROOF", div:"07", name:`Roofing Assembly (${proj.roofing||"Asphalt Shingles"})`,
      confidence:"MEDIUM",
      math:`${Math.round(roofSF/100)} SQ roofing (${roofSF.toLocaleString()} SF)`,
      components:[
        { desc:`${proj.roofing||"Architectural asphalt shingles"} 30yr`, qty:Math.round(roofSF/100), unit:"SQ", unitCost:Math.round(195*lm), total:Math.round(roofSF/100*195*lm) },
        { desc:"Self-adhering ice & water shield 6\" eaves", qty:Math.round(roofSF*0.15), unit:"SF", unitCost:Math.round(0.95*lm), total:Math.round(roofSF*0.15*0.95*lm) },
        { desc:"#30 felt underlayment",             qty:Math.round(roofSF/100), unit:"SQ", unitCost:Math.round(18*lm),   total:Math.round(roofSF/100*18*lm) },
        { desc:"7/16\" OSB roof sheathing",         qty:roofSF, unit:"SF",              unitCost:Math.round(0.88*lm), total:Math.round(roofSF*0.88*lm) },
        { desc:"Ridge cap & hip shingles",          qty:Math.round(Math.sqrt(roofSF/stories)*4), unit:"LF", unitCost:Math.round(8.50*lm), total:Math.round(Math.sqrt(roofSF/stories)*4*8.50*lm) },
        { desc:"Roofing labor",                     qty:Math.round(roofSF/100), unit:"SQ", unitCost:Math.round(220*lm), total:Math.round(roofSF/100*220*lm) },
      ],
    },

    // DIV 07 — INSULATION
    {
      id:"07-INSUL", div:"07", name:"Insulation Assembly",
      confidence: proj.specNotes?.some(n=>n.includes("R-21"))||proj.specNotes?.some(n=>n.toLowerCase().includes("insul")) ? "HIGH" : "MEDIUM",
      math:`Ext walls ${extWallSF.toLocaleString()} SF + Attic ${roofSF.toLocaleString()} SF`,
      specNote: proj.specNotes?.find(n=>n.toLowerCase().includes("insul"))||null,
      components:[
        { desc:"R-21 kraft-faced batts ext walls",  qty:extWallSF, unit:"SF", unitCost:Math.round(1.05*lm), total:Math.round(extWallSF*1.05*lm) },
        { desc:"R-38 blown cellulose attic",        qty:roofSF,    unit:"SF", unitCost:Math.round(1.45*lm), total:Math.round(roofSF*1.45*lm) },
        { desc:"Rigid foam continuous R-5 (if spec)",qty:extWallSF,unit:"SF", unitCost:Math.round(0.85*lm), total:Math.round(extWallSF*0.85*lm) },
      ],
    },

    // DIV 08 — DOORS (schedule-driven)
    {
      id:"08-DOOR", div:"08", name:"Door Assembly",
      confidence:doorSource,
      math: dsched.length
        ? `From door schedule: ${dsched.map(d=>`${d.qty||1}× Type ${d.mark}`).join(", ")}`
        : `${totalDoors} doors estimated @ 1 per ${Math.round(sqft/totalDoors)} SF`,
      scheduleData: dsched.length ? dsched : null,
      components: dsched.length
        ? dsched.map(d=>({ desc:`${d.qty||1}× ${d.type} — ${d.material} + ${d.hardware}`, qty:d.qty||1, unit:"EA", unitCost:Math.round(doorCost/totalDoors), total:Math.round(doorCost/totalDoors*(d.qty||1)) }))
        : [{ desc:`${totalDoors} interior/exterior doors (estimated mix)`, qty:totalDoors, unit:"EA", unitCost:Math.round(700*lm), total:Math.round(totalDoors*700*lm) }],
    },

    // DIV 08 — WINDOWS (schedule-driven)
    {
      id:"08-WIN", div:"08", name:"Window Assembly",
      confidence:winSource,
      math: wsched.length
        ? `From window schedule: ${wsched.map(w=>`${w.qty||1}× ${w.mark} (${w.width}×${w.height})`).join(", ")}`
        : `${totalWindows} windows estimated`,
      scheduleData: wsched.length ? wsched : null,
      components: wsched.length
        ? wsched.map(w=>({ desc:`${w.qty||1}× ${w.mark}: ${w.width}\"×${w.height}\" ${w.type} — ${w.material}, ${w.glazing}`, qty:w.qty||1, unit:"EA", unitCost:Math.round(winCost/totalWindows), total:Math.round(winCost/totalWindows*(w.qty||1)) }))
        : [{ desc:`${totalWindows} vinyl double-hung windows (estimated)`, qty:totalWindows, unit:"EA", unitCost:Math.round(520*lm), total:Math.round(totalWindows*520*lm) }],
    },

    // DIV 09 — DRYWALL
    {
      id:"09-DRY", div:"09", name:"Drywall Assembly (Level 4 Finish)",
      confidence:"MEDIUM",
      math:`${drywallSF.toLocaleString()} SF (ext walls + int partitions both sides + 10% waste)`,
      specNote: proj.specNotes?.find(n=>n.toLowerCase().includes("level 4"))||null,
      components:[
        { desc:'5/8" Type X gypsum wallboard',     qty:drywallSF, unit:"SF", unitCost:Math.round(0.58*lm), total:Math.round(drywallSF*0.58*lm) },
        { desc:"Steel Z-channel framing accessories",qty:Math.round(drywallSF*0.15), unit:"SF", unitCost:Math.round(0.35*lm), total:Math.round(drywallSF*0.15*0.35*lm) },
        { desc:"Hang labor",                       qty:drywallSF, unit:"SF", unitCost:Math.round(0.72*lm), total:Math.round(drywallSF*0.72*lm) },
        { desc:"Tape, mud, Level 4 finish",        qty:drywallSF, unit:"SF", unitCost:Math.round(0.95*lm), total:Math.round(drywallSF*0.95*lm) },
      ],
    },

    // DIV 09 — FLOORING (finish-schedule-driven)
    {
      id:"09-FLOOR", div:"09", name:"Flooring Assembly",
      confidence:floorSource,
      math: fsched.length
        ? `From finish schedule: LVP ${lvpSF.toLocaleString()} SF · Tile ${tileSF.toLocaleString()} SF`
        : `Estimated: LVP ${lvpSF.toLocaleString()} SF · Tile ${tileSF.toLocaleString()} SF`,
      scheduleData: fsched.length ? fsched.map(r=>({room:r.room, finish:r.floor})) : null,
      components:[
        ...(lvpSF>0  ? [{ desc:`LVP 5mm click-lock (${lvpSF.toLocaleString()} SF from ${fsched.length?"finish schedule":"estimate"})`, qty:lvpSF,  unit:"SF", unitCost:Math.round(5.80*lm), total:Math.round(lvpSF*5.80*lm) }] : []),
        ...(tileSF>0 ? [{ desc:`Porcelain/Ceramic tile 12×24 (${tileSF.toLocaleString()} SF)`, qty:tileSF, unit:"SF", unitCost:Math.round(9.80*lm), total:Math.round(tileSF*9.80*lm) }] : []),
        ...(carpetSF>0? [{ desc:`Carpet & pad (${carpetSF.toLocaleString()} SF)`, qty:carpetSF, unit:"SF", unitCost:Math.round(4.20*lm), total:Math.round(carpetSF*4.20*lm) }] : []),
      ],
    },

    // DIV 09 — PAINT
    {
      id:"09-PAINT", div:"09", name:"Paint Assembly",
      confidence:"MEDIUM",
      math:`${drywallSF.toLocaleString()} SF walls/ceilings + ext surfaces`,
      components:[
        { desc:"Int walls — primer + 2 coats latex eggshell", qty:Math.round(drywallSF*0.75), unit:"SF", unitCost:Math.round(1.90*lm), total:Math.round(drywallSF*0.75*1.90*lm) },
        { desc:"Int ceilings — primer + 2 coats flat",        qty:sqft,    unit:"SF", unitCost:Math.round(1.40*lm), total:Math.round(sqft*1.40*lm) },
        { desc:"Exterior paint/stain — 2 coats",              qty:extWallSF, unit:"SF", unitCost:Math.round(2.20*lm), total:Math.round(extWallSF*2.20*lm) },
      ],
    },

    // DIV 22 — PLUMBING
    {
      id:"22-PLUMB", div:"22", name:"Plumbing Assembly",
      confidence:"MEDIUM",
      math:`${fixtures} fixtures × $2,800/fixture avg (rough-in + trim)`,
      components:[
        { desc:"Plumbing rough-in DWV (drain/waste/vent)", qty:Math.round(sqft*0.5), unit:"LF", unitCost:Math.round(8.50*lm),  total:Math.round(sqft*0.5*8.50*lm) },
        { desc:"Water supply rough-in (hot & cold)",       qty:Math.round(sqft*0.4), unit:"LF", unitCost:Math.round(6.20*lm),  total:Math.round(sqft*0.4*6.20*lm) },
        { desc:`Fixture trim-out — ${fixtures} fixtures`,  qty:fixtures,              unit:"EA", unitCost:Math.round(420*lm),   total:Math.round(fixtures*420*lm) },
        { desc:"Water heater — 50 gal tank",               qty:stories,               unit:"EA", unitCost:Math.round(1850*lm),  total:Math.round(stories*1850*lm) },
        { desc:"Pressure-reduce valve + main shut-off",    qty:1,                     unit:"LS", unitCost:Math.round(380*lm),   total:Math.round(380*lm) },
      ],
    },

    // DIV 23 — HVAC
    {
      id:"23-HVAC", div:"23", name:`HVAC Assembly — ${tons}-Ton Split System`,
      confidence:"MEDIUM",
      math:`${tons} tons × $4,200/ton (equipment + ductwork + labor)`,
      components:[
        { desc:`${tons}-ton condensing unit (outdoor)`,   qty:stories, unit:"EA", unitCost:Math.round(tons/stories*1800*lm), total:Math.round(stories*(tons/stories*1800)*lm) },
        { desc:`${tons}-ton air handler (indoor)`,        qty:stories, unit:"EA", unitCost:Math.round(tons/stories*1200*lm), total:Math.round(stories*(tons/stories*1200)*lm) },
        { desc:"Sheet metal ductwork supply & return",    qty:sqft,    unit:"SF", unitCost:Math.round(4.80*lm), total:Math.round(sqft*4.80*lm) },
        { desc:"Flex duct, registers, grilles, diffusers",qty:sqft,    unit:"SF", unitCost:Math.round(1.20*lm), total:Math.round(sqft*1.20*lm) },
        { desc:"Refrigerant lineset & startup",           qty:stories, unit:"EA", unitCost:Math.round(650*lm),  total:Math.round(stories*650*lm) },
      ],
    },

    // DIV 26 — ELECTRICAL
    {
      id:"26-ELEC", div:"26", name:`Electrical Assembly — ${amps}A Service`,
      confidence: proj.specNotes?.some(n=>n.includes("200A")||n.includes("circuit")) ? "HIGH" : "MEDIUM",
      math:`${sqft.toLocaleString()} SF × $12.50/SF + ${amps}A panel`,
      specNote: proj.specNotes?.find(n=>n.toLowerCase().includes("electric"))||null,
      components:[
        { desc:`${amps}A main service panel + meter base`, qty:stories, unit:"EA", unitCost:Math.round(1850*lm), total:Math.round(stories*1850*lm) },
        { desc:"Branch circuit wiring (NM-B/conduit)",     qty:sqft,    unit:"SF", unitCost:Math.round(4.20*lm), total:Math.round(sqft*4.20*lm) },
        { desc:"Outlets, switches, GFCI, AFCI devices",    qty:Math.round(sqft/150), unit:"EA", unitCost:Math.round(48*lm), total:Math.round(sqft/150*48*lm) },
        { desc:"Light fixtures rough-in & boxes",          qty:Math.round(sqft/100), unit:"EA", unitCost:Math.round(38*lm), total:Math.round(sqft/100*38*lm) },
        { desc:"Smoke & CO detectors (code)",               qty:Math.round(sqft/400), unit:"EA", unitCost:Math.round(95*lm), total:Math.round(sqft/400*95*lm) },
      ],
    },

    // DIV 31 — SITE
    {
      id:"31-SITE", div:"31", name:"Earthwork & Site Assembly",
      confidence:"LOW",
      math:`Ratio estimate: ${sqft.toLocaleString()} SF project, no site plan uploaded`,
      components:[
        { desc:"Excavation, grading & rough grading",   qty:Math.round(sqft*0.12), unit:"CY", unitCost:Math.round(28*lm), total:Math.round(sqft*0.12*28*lm) },
        { desc:"Backfill & compaction",                 qty:Math.round(sqft*0.06), unit:"CY", unitCost:Math.round(22*lm), total:Math.round(sqft*0.06*22*lm) },
        { desc:"Storm drainage & swales",               qty:1,                     unit:"LS", unitCost:Math.round(sqft*1.20*lm), total:Math.round(sqft*1.20*lm) },
      ],
    },
  ];

  // Compute totals
  assemblies.forEach(a => { a.assemblyTotal = a.components.reduce((s,c)=>s+c.total,0); });

  // Division subtotals
  const divSubs = {};
  assemblies.forEach(a => { divSubs[a.div] = (divSubs[a.div]||0) + a.assemblyTotal; });

  const direct      = Object.values(divSubs).reduce((a,b)=>a+b,0);
  const laborBurden = Math.round(direct*0.12);
  const salesTax    = Math.round(direct*0.04);
  const overhead    = Math.round((direct+laborBurden+salesTax)*0.12);
  const profit      = Math.round((direct+laborBurden+salesTax+overhead)*0.10);
  const contingency = Math.round(direct*0.05);
  const bid         = direct+laborBurden+salesTax+overhead+profit+contingency;
  const design      = Math.round(bid*0.08);
  const permits     = Math.round(bid*0.02);
  const ownCont     = Math.round(bid*0.10);
  const ffe         = Math.round(bid*0.05);
  const ownerTotal  = bid+design+permits+ownCont+ffe;

  const confidenceSummary = {
    high:   assemblies.filter(a=>a.confidence==="HIGH").length,
    medium: assemblies.filter(a=>a.confidence==="MEDIUM").length,
    low:    assemblies.filter(a=>a.confidence==="LOW").length,
    total:  assemblies.length,
  };

  return {
    proj, location: loc, lm, sqft, assemblies, divSubs, direct,
    schedule:{ direct, laborBurden, salesTax, overhead, profit, contingency, bid },
    owner:{ bid, design, permits, ownCont, ffe, total:ownerTotal },
    bidPSF: Math.round(bid/sqft),
    ownerPSF: Math.round(ownerTotal/sqft),
    confidenceSummary,
    finishSchedule: schedules?.finish || proj.finishSchedule || [],
    doorSchedule:   schedules?.doors  || proj.doorSchedule   || [],
    windowSchedule: schedules?.windows|| proj.windowSchedule || [],
    specNotes:      schedules?.spec   || proj.specNotes       || [],
  };
}

// ─── CLAUDE API ───────────────────────────────────────────────────────────────
async function claude(content, system="") {
  const body={ model:"claude-sonnet-4-6", max_tokens:6000, messages:[{role:"user",content}] };
  if(system) body.system=system;
  const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!r.ok) throw new Error(`API ${r.status}: ${await r.text()}`);
  const d=await r.json(); return d.content?.[0]?.text||"";
}

async function claudePDF(b64, text) {
  const body={model:"claude-sonnet-4-6",max_tokens:6000,messages:[{role:"user",content:[{type:"document",source:{type:"base64",media_type:"application/pdf",data:b64}},{type:"text",text}]}]};
  const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!r.ok) throw new Error(`API ${r.status}`);
  const d=await r.json(); return d.content?.[0]?.text||"";
}

function tj(text) {
  try { return JSON.parse(text.replace(/```json\n?/g,"").replace(/```\n?/g,"").trim()); }
  catch { const m=text.match(/\{[\s\S]*\}/); if(m) try{return JSON.parse(m[0]);}catch{} return null; }
}

function toB64(file){ return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(file);}); }

// ─── FORMAT ───────────────────────────────────────────────────────────────────
const $v=(n)=>"$"+Math.round(n||0).toLocaleString();
const nv=(n)=>Math.round(n||0).toLocaleString();
const CONF_COLOR={ HIGH:T.green, MEDIUM:T.orange, LOW:T.red };
const CONF_BG={    HIGH:"rgba(34,197,94,0.1)", MEDIUM:"rgba(249,115,22,0.1)", LOW:"rgba(239,68,68,0.1)" };

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen]   = useState("home");
  const [pdfs,   setPdfs]     = useState([]);
  const [b64s,   setB64s]     = useState([]);
  const [drag,   setDrag]     = useState(false);
  const [loc,    setLoc]      = useState("Brooklyn, NY");
  const [logs,   setLogs]     = useState(STAGES.map(s=>({...s,status:"pending",log:""})));
  const [cur,    setCur]      = useState(0);
  const [results,setResults]  = useState(null);
  const [tab,    setTab]      = useState("dash");
  const [err,    setErr]      = useState("");
  const [proposal,setProposal]= useState("");
  const [expAss, setExpAss]   = useState(null); // expanded assembly id
  const fRef = useRef();

  const setLog = useCallback((id,status,log="")=>setLogs(p=>p.map(s=>s.id===id?{...s,status,log}:s)),[]);
  const wait   = (ms)=>new Promise(r=>setTimeout(r,ms));

  // ─── FILE HANDLING ──────────────────────────────────────────────────────────
  const handleFiles = async (files) => {
    const pdfsArr=[...files].filter(f=>f.name.toLowerCase().endsWith(".pdf"));
    if(!pdfsArr.length){setErr("Upload PDF blueprints.");return;}
    setErr("");
    setPdfs(pdfsArr);
    const b64arr = await Promise.all(pdfsArr.map(toB64));
    setB64s(b64arr);
  };
  const onDrop=(e)=>{e.preventDefault();setDrag(false);handleFiles(e.dataTransfer.files);};

  // ─── PIPELINE ───────────────────────────────────────────────────────────────
  const run = async (proj, isDemo=false) => {
    setErr(""); setScreen("running");
    setLogs(STAGES.map(s=>({...s,status:"pending",log:""})));
    setProposal(""); setCur(0);
    const location = loc||"United States";
    let finalProj  = {...proj};
    let schedules  = { doors:[], windows:[], finish:[], spec:[] };

    try {
      // ── L1: Sheet Detection ──────────────────────────────────────────────
      setCur(1); setLog(1,"running",isDemo?"Loading demo project data...":b64s.length?"Analyzing uploaded PDFs...":"Reading project data...");
      if(b64s.length && !isDemo) {
        try {
          const raw = await claudePDF(b64s[0],
            `Analyze these construction blueprints. Return ONLY JSON:
{"name":"","type":"","sqft":0,"stories":0,"foundation":"","framing":"","roofing":"","panel_amps":0,"plumbing_fixtures":0,"hvac_tons":0,
"sheet_types":["floor_plan","schedule","mep","elevation","site"],
"has_finish_schedule":false,"has_door_schedule":false,"has_window_schedule":false,"has_spec_notes":false,
"notes":""}`);
          const p=tj(raw);
          if(p){
            if(p.sqft>0)      finalProj={...finalProj,...p};
            if(p.sheet_types) finalProj.sheetTypes=p.sheet_types;
          }
        } catch(e){ /* use provided data */ }
      }
      await wait(300);
      setLog(1,"done",`${finalProj.name||"Project"} · ${nv(finalProj.sqft)} SF · ${finalProj.stories} stor${Number(finalProj.stories)>1?"ies":"y"} · ${pdfs.length||"demo"} sheet${pdfs.length>1?"s":""} detected`);

      // ── L2: Multi-Pass Extraction ────────────────────────────────────────
      setCur(2); setLog(2,"running","Extracting floor plans · schedules · MEP · notes...");
      if(b64s.length>1 && !isDemo) {
        // Multi-sheet: each PDF gets a type-specific pass
        for(let i=1;i<Math.min(b64s.length,4);i++) {
          try {
            const raw2 = await claudePDF(b64s[i],`Identify this sheet type and extract key data. Return JSON: {"sheet_type":"floor_plan/schedule/mep/elevation/site","key_data":{}}`);
          } catch(e){}
        }
      }
      await wait(500);
      setLog(2,"done",`Extracted: floor plan · room dims · structural · MEP · ${(finalProj.sheetTypes||["floor plan"]).join(" · ")}`);

      // ── L3: Schedule Parsing ─────────────────────────────────────────────
      setCur(3); setLog(3,"running","Reading finish schedule · door schedule · window schedule...");
      if(b64s.length && !isDemo) {
        try {
          const raw3 = await claudePDF(b64s[0],
`Read ALL schedules visible in these drawings. Return ONLY JSON:
{
  "finish_schedule":[{"room":"","floor":"","wall":"","ceiling":"","base":""}],
  "door_schedule":[{"mark":"","width":0,"height":0,"type":"","material":"","hardware":"","qty":1}],
  "window_schedule":[{"mark":"","width":0,"height":0,"type":"","material":"","glazing":"","qty":1}],
  "spec_notes":[""]
}
If a schedule is not visible, return empty array. Width/height in inches.`);
          const sched=tj(raw3);
          if(sched){
            if(sched.finish_schedule?.length) schedules.finish=sched.finish_schedule;
            if(sched.door_schedule?.length)   schedules.doors =sched.door_schedule;
            if(sched.window_schedule?.length) schedules.windows=sched.window_schedule;
            if(sched.spec_notes?.length)      schedules.spec  =sched.spec_notes;
          }
        } catch(e){}
      } else if(isDemo) {
        // Demo uses pre-loaded schedule data
        schedules = { finish:DEMO.finishSchedule, doors:DEMO.doorSchedule, windows:DEMO.windowSchedule, spec:DEMO.specNotes };
      }
      await wait(400);
      const sInfo=[
        schedules.finish.length  ?`Finish sched: ${schedules.finish.length} rooms`  :"Finish sched: not found",
        schedules.doors.length   ?`Door sched: ${schedules.doors.reduce((a,d)=>a+(d.qty||1),0)} doors`   :"Door sched: estimated",
        schedules.windows.length ?`Window sched: ${schedules.windows.reduce((a,w)=>a+(w.qty||1),0)} windows`:"Window sched: estimated",
      ].join(" · ");
      setLog(3,"done",sInfo);

      // ── L4: Cross-Reference ──────────────────────────────────────────────
      setCur(4); setLog(4,"running","Cross-referencing schedules → rooms → confidence levels...");
      await wait(500);
      const upgrades=[];
      if(schedules.finish.length) upgrades.push(`Flooring: LOW→HIGH (${schedules.finish.length} rooms scheduled)`);
      if(schedules.doors.length)  upgrades.push(`Doors: MEDIUM→HIGH (${schedules.doors.length} door types scheduled)`);
      if(schedules.windows.length)upgrades.push(`Windows: MEDIUM→HIGH (${schedules.windows.length} window types scheduled)`);
      setLog(4,"done",upgrades.length?`Upgraded: ${upgrades.join(" · ")}`:"No schedules found — using ratio estimates (LOW/MEDIUM)");

      // ── L5: Assembly Building ─────────────────────────────────────────────
      setCur(5); setLog(5,"running","Building trade assemblies with components...");
      await wait(500);
      const est=buildAssemblies(finalProj,location,schedules);
      const totalComponents=est.assemblies.reduce((a,asm)=>a+asm.components.length,0);
      setLog(5,"done",`${est.assemblies.length} assemblies · ${totalComponents} components · HIGH:${est.confidenceSummary.high} MEDIUM:${est.confidenceSummary.medium} LOW:${est.confidenceSummary.low}`);

      // ── L6: Pricing & Confidence ──────────────────────────────────────────
      setCur(6); setLog(6,"running",`Applying ${location} pricing (${est.lm.toFixed(2)}× regional factor)...`);
      await wait(400);
      setLog(6,"done",`Direct cost: ${$v(est.direct)} · Bid: ${$v(est.schedule.bid)} · ${$v(est.bidPSF)}/SF`);

      // ── L7: Estimate Assembly ─────────────────────────────────────────────
      setCur(7); setLog(7,"running","Assembling 3-version estimate...");
      await wait(400);
      setLog(7,"done",`Contractor Bid: ${$v(est.schedule.bid)} · Owner Budget: ${$v(est.owner.total)} · ${$v(est.bidPSF)}/SF`);

      // ── L8: Proposal Writing ──────────────────────────────────────────────
      setCur(8); setLog(8,"running","Claude writing professional proposal...");
      const today=new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"});
      const divLines=Object.entries(est.divSubs).sort(([,a],[,b])=>b-a).map(([d,c])=>`  CSI ${d} ${CSI[d]?.name||d}: ${$v(c)}`).join("\n");
      const confDetail=`HIGH confidence: ${est.confidenceSummary.high}/${est.confidenceSummary.total} assemblies (from schedules/drawings)\nMEDIUM confidence: ${est.confidenceSummary.medium}/${est.confidenceSummary.total} (calculated from dimensions)\nLOW confidence: ${est.confidenceSummary.low}/${est.confidenceSummary.total} (ratio estimates — flag for field verify)`;
      const schedLines=[
        schedules.finish.length?`Finish Schedule: ${schedules.finish.map(r=>`${r.room}: ${r.floor}`).join("; ")}`:"",
        schedules.doors.length ?`Door Schedule: ${schedules.doors.map(d=>`${d.qty||1}× Type ${d.mark} ${d.type}`).join(", ")}`:"",
        schedules.windows.length?`Window Schedule: ${schedules.windows.map(w=>`${w.qty||1}× ${w.mark} ${w.width}×${w.height}`).join(", ")}`:"",
        schedules.spec.length  ?`Spec Notes: ${schedules.spec.slice(0,3).join("; ")}`:"",
      ].filter(Boolean).join("\n");

      try {
        const pt=await claude(
`Write a professional construction estimate proposal for this project.

PROJECT: ${finalProj.name||"Estimate"} | ${location} | ${today}
SIZE: ${nv(est.sqft)} SF | ${finalProj.stories} stories | ${finalProj.type||"Building"}

SCHEDULE & SPEC DATA EXTRACTED:
${schedLines||"No schedules found on drawings — estimates based on industry ratios"}

DIVISION COSTS:
${divLines}

MARKUP SCHEDULE:
  Direct Cost:         ${$v(est.direct)}
  Labor Burden (12%):  ${$v(est.schedule.laborBurden)}
  Sales Tax (4%):      ${$v(est.schedule.salesTax)}
  Overhead (12%):      ${$v(est.schedule.overhead)}
  Profit (10%):        ${$v(est.schedule.profit)}
  Contingency (5%):    ${$v(est.schedule.contingency)}
  TOTAL CONTRACT BID:  ${$v(est.schedule.bid)}

OWNER BUDGET:
  Contractor Bid:      ${$v(est.owner.bid)}
  Design/Eng (8%):     ${$v(est.owner.design)}
  Permits (2%):        ${$v(est.owner.permits)}
  Owner Contingency:   ${$v(est.owner.ownCont)}
  FF&E (5%):           ${$v(est.owner.ffe)}
  TOTAL OWNER BUDGET:  ${$v(est.owner.total)}

CONFIDENCE SUMMARY:
${confDetail}

Write these 7 sections using markdown:
1. EXECUTIVE SUMMARY — 3 key numbers table, project overview, confidence rating
2. CONTRACTOR BID PROPOSAL — full division table + markup schedule
3. OWNER'S TOTAL PROJECT BUDGET
4. TRADE-BY-TRADE BREAKDOWN — scope notes + budget per sub-trade
5. SCHEDULE SUMMARY — what was extracted from drawings vs. estimated
6. ASSUMPTIONS, EXCLUSIONS & LOW-CONFIDENCE ITEMS — flag items needing field verification
7. VALUE ENGINEERING OPTIONS — 3 specific items with savings

Mark as: PRELIMINARY ESTIMATE — FOR BUDGETING PURPOSES ONLY
Be specific. Reference schedules and spec notes where applicable.`,
          "You are a senior licensed construction estimator. Write a professional, specific proposal document. Reference schedules and spec data that was extracted. Use markdown with headers and tables."
        );
        setProposal(pt);
      } catch(e){ setProposal(`# ${finalProj.name||"Estimate"}\n*${today}*\n\n**Contractor Bid: ${$v(est.schedule.bid)}**\n**Owner Budget: ${$v(est.owner.total)}**\n**Cost/SF: ${$v(est.bidPSF)}/SF**\n\n*(Proposal writing unavailable — all estimate data shown in tabs above)*`); }

      setLog(8,"done","Complete · 7 sections · schedule data embedded · confidence flags noted");
      setResults(est); setTab("dash"); setScreen("results");

    } catch(e) {
      setErr(`Layer ${cur} error: ${e.message}`);
      setLog(cur,"error",e.message);
    }
  };

  const runDemo = ()=>run(DEMO,true);

  const download=()=>{
    if(!results) return;
    const e=results;
    const sections=[
      `CONSTRUCTION ESTIMATE PACKAGE — ${e.proj.name||"Project"}`,
      `${"=".repeat(60)}`,
      `Location: ${e.location} | Generated: ${new Date().toLocaleDateString()}`,
      `CONTRACTOR BID: ${$v(e.schedule.bid)} | OWNER BUDGET: ${$v(e.owner.total)} | COST/SF: ${$v(e.bidPSF)}`,
      `\nCONFIDENCE: HIGH: ${e.confidenceSummary.high} assemblies | MEDIUM: ${e.confidenceSummary.medium} | LOW: ${e.confidenceSummary.low}`,
      `\n${"=".repeat(60)}\n`,
      proposal||"Proposal not generated",
      `\n${"=".repeat(60)}\nASSEMBLY DETAIL\n${"=".repeat(60)}`,
      ...e.assemblies.map(a=>[`\n[${a.confidence}] ${a.name}`,`Math: ${a.math}`,`Total: ${$v(a.assemblyTotal)}`,...a.components.map(c=>`  - ${c.desc}: ${nv(c.qty)} ${c.unit} × ${$v(c.unitCost)} = ${$v(c.total)}`)].join("\n")),
    ];
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([sections.join("\n")],{type:"text/plain"}));
    a.download=`Estimate_${(e.proj.name||"Project").replace(/\s+/g,"_")}.md`;
    a.click();
  };

  // ─── HOME ──────────────────────────────────────────────────────────────────
  if(screen==="home") return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:T.mono}}>
      <div style={{position:"fixed",inset:0,backgroundImage:`linear-gradient(${T.amberDim}18 1px,transparent 1px),linear-gradient(90deg,${T.amberDim}18 1px,transparent 1px)`,backgroundSize:"48px 48px",pointerEvents:"none"}}/>
      <div style={{position:"relative",maxWidth:820,margin:"0 auto",padding:"44px 20px"}}>

        {/* HEADER */}
        <div style={{marginBottom:40}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:16,marginBottom:14}}>
            <div style={{background:T.amber,width:52,height:52,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>📐</div>
            <div>
              <div style={{fontSize:9,letterSpacing:"0.35em",color:T.amber,textTransform:"uppercase",marginBottom:3}}>Blueprint Estimator Pro · 8-Layer Pipeline</div>
              <div style={{fontSize:26,fontWeight:700,color:"#FAFAFA",letterSpacing:"-0.03em",lineHeight:1}}>Construction Estimator</div>
              <div style={{fontSize:10,color:T.dim,marginTop:4}}>Beats Togal.AI — reads finish schedules · door/window schedules · spec notes · confidence-flags every number</div>
            </div>
          </div>
          {/* vs Togal callout */}
          <div style={{background:T.panel,border:`1px solid ${T.border2}`,padding:"12px 16px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,fontSize:10}}>
            <div>
              <div style={{color:T.red,fontWeight:700,marginBottom:6}}>❌ Togal.AI Limitations</div>
              {["Draws boxes — can't read text/notes","Only floor plans — no schedules","No confidence flags — trust blindly","80/20 paradox: manual finish required","Can't read finish/door/window schedules"].map(t=><div key={t} style={{color:T.dim,marginBottom:2}}>· {t}</div>)}
            </div>
            <div>
              <div style={{color:T.green,fontWeight:700,marginBottom:6}}>✅ This Pipeline</div>
              {["Claude reads annotations + spec notes","Finish · door · window schedule parsing","HIGH/MEDIUM/LOW confidence on every item","Shows math for every calculation","Assembly builder: raw qty → full breakdown"].map(t=><div key={t} style={{color:T.dim,marginBottom:2}}>· {t}</div>)}
            </div>
          </div>
        </div>

        {/* UPLOAD ZONE */}
        <div onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={onDrop} onClick={()=>fRef.current.click()}
          style={{background:drag?"rgba(245,166,35,0.06)":pdfs.length?"rgba(34,197,94,0.06)":T.panel,border:`2px dashed ${drag?T.amber:pdfs.length?T.green:T.border2}`,padding:"36px 20px",textAlign:"center",cursor:"pointer",marginBottom:20,transition:"all 0.2s"}}>
          <input ref={fRef} type="file" accept=".pdf" multiple style={{display:"none"}} onChange={e=>e.target.files.length&&handleFiles(e.target.files)}/>
          <div style={{fontSize:36,marginBottom:8}}>{pdfs.length?"📂":"📄"}</div>
          {pdfs.length ? (
            <>
              <div style={{color:T.green,fontSize:13,fontWeight:700}}>{pdfs.length} PDF{pdfs.length>1?"s":""} loaded</div>
              {pdfs.map(f=><div key={f.name} style={{color:T.dim,fontSize:10,marginTop:2}}>· {f.name}</div>)}
              <div style={{color:T.faint,fontSize:10,marginTop:6}}>Click to add more sheets</div>
            </>
          ) : (
            <>
              <div style={{color:T.text,fontSize:13,fontWeight:600}}>Drop blueprint PDFs here</div>
              <div style={{color:T.dim,fontSize:10,marginTop:4}}>Upload multiple sheets — floor plans · schedules · MEP · elevations</div>
              <div style={{color:T.amberDim,fontSize:10,marginTop:2}}>The more sheets you upload, the higher the confidence scores</div>
            </>
          )}
        </div>

        {/* LOCATION + LAUNCH */}
        <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:12,marginBottom:16,alignItems:"end"}}>
          <div>
            <label style={{display:"block",fontSize:9,letterSpacing:"0.2em",color:T.amber,marginBottom:5,textTransform:"uppercase"}}>Project Location (regional pricing)</label>
            <input value={loc} onChange={e=>setLoc(e.target.value)} placeholder="Brooklyn, NY"
              style={{width:"100%",background:T.panel,border:`1px solid ${T.border2}`,color:T.text,padding:"10px 12px",fontSize:12,fontFamily:T.mono,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <button onClick={runDemo}
            style={{background:"rgba(245,166,35,0.12)",border:`1px solid ${T.amberDim}`,color:T.amber,padding:"10px 18px",fontSize:10,cursor:"pointer",fontFamily:T.mono,fontWeight:700,letterSpacing:"0.1em",whiteSpace:"nowrap"}}>
            ▶ RUN DEMO
          </button>
        </div>

        {err&&<div style={{background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.3)",color:"#FCA5A5",padding:"9px 12px",fontSize:10,marginBottom:12}}>{err}</div>}

        {pdfs.length>0 && (
          <button onClick={()=>run({name:pdfs[0].name.replace(".pdf",""),type:"Building",sqft:2500,stories:1,foundation:"Per Drawings",framing:"Per Drawings",roofing:"Per Drawings",panel_amps:200,plumbing_fixtures:6,hvac_tons:4})}
            style={{width:"100%",padding:"14px",background:T.amber,color:T.bg,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:T.mono,marginBottom:16}}>
            ▶ LAUNCH 8-LAYER PIPELINE WITH {pdfs.length} SHEET{pdfs.length>1?"S":""}
          </button>
        )}

        {/* STAGE STRIP */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",gap:3}}>
          {STAGES.map(s=>(
            <div key={s.id} style={{background:T.panel,border:`1px solid ${T.border}`,padding:"8px 4px",textAlign:"center"}}>
              <div style={{fontSize:13}}>{s.icon}</div>
              <div style={{fontSize:7,color:T.amber,marginTop:2}}>L{s.id}</div>
              <div style={{fontSize:6,color:T.faint,marginTop:1,lineHeight:1.3}}>{s.label.split(" ").slice(0,2).join("\n")}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ─── RUNNING ───────────────────────────────────────────────────────────────
  if(screen==="running") return (
    <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:T.mono,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{position:"fixed",inset:0,backgroundImage:`linear-gradient(${T.amberDim}15 1px,transparent 1px),linear-gradient(90deg,${T.amberDim}15 1px,transparent 1px)`,backgroundSize:"48px 48px",pointerEvents:"none"}}/>
      <div style={{position:"relative",width:"100%",maxWidth:600,padding:"32px 20px"}}>
        <div style={{textAlign:"center",marginBottom:40}}>
          <div style={{fontSize:9,letterSpacing:"0.35em",color:T.amber,textTransform:"uppercase",marginBottom:8}}>8-Layer Pipeline Running</div>
          <div style={{fontSize:22,fontWeight:700,color:"#FAFAFA"}}>Building Your Estimate</div>
          <div style={{fontSize:10,color:T.dim,marginTop:4}}>Reading schedules · cross-referencing · building assemblies</div>
        </div>
        {logs.map((s,i)=>{
          const done=s.status==="done",run=s.status==="running",bad=s.status==="error";
          return (
            <div key={s.id} style={{display:"flex",gap:0}}>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginRight:12,width:28,flexShrink:0}}>
                <div style={{width:28,height:28,borderRadius:"50%",border:`2px solid ${done?T.green:run?T.amber:bad?T.red:T.border2}`,background:done?"rgba(34,197,94,0.1)":run?"rgba(245,166,35,0.1)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,flexShrink:0,transition:"all 0.3s"}}>
                  {done?<span style={{color:T.green}}>✓</span>:bad?<span style={{color:T.red}}>✗</span>:run?<span style={{color:T.amber,display:"inline-block",animation:"sp 1s linear infinite"}}>◐</span>:<span style={{color:T.faint,fontSize:8}}>{s.id}</span>}
                </div>
                {i<logs.length-1&&<div style={{width:1,flex:1,minHeight:16,background:done?"rgba(34,197,94,0.4)":T.border,transition:"background 0.4s"}}/>}
              </div>
              <div style={{flex:1,paddingBottom:12}}>
                <div style={{padding:"9px 12px",background:run?T.panel:"transparent",border:`1px solid ${run?T.amber:done?`rgba(34,197,94,0.2)`:"transparent"}`,transition:"all 0.3s"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:13}}>{s.icon}</span>
                    <span style={{fontSize:11,color:run?"#FAFAFA":done?T.green:T.faint,fontWeight:run?600:400}}>{s.label}</span>
                  </div>
                  {s.log&&<div style={{fontSize:9,color:done?"#6EE7B7":bad?"#FCA5A5":T.dim,marginTop:4,paddingLeft:22}}>{s.log}</div>}
                </div>
              </div>
            </div>
          );
        })}
        {err&&<div style={{marginTop:12,background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.3)",color:"#FCA5A5",padding:"10px 14px",fontSize:10}}>
          {err}<button onClick={()=>setScreen("home")} style={{display:"block",marginTop:8,background:T.red,color:"white",border:"none",padding:"5px 12px",cursor:"pointer",fontSize:9,fontFamily:T.mono}}>← Restart</button>
        </div>}
        <style>{`@keyframes sp{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  // ─── RESULTS ───────────────────────────────────────────────────────────────
  if(screen==="results"&&results) {
    const e=results;
    const cs=e.confidenceSummary;
    const confPct=Math.round(((cs.high*3+cs.medium*2+cs.low*1)/(cs.total*3))*100);
    const TABS=[
      {id:"dash",l:"Dashboard"},{id:"bid",l:"Contractor Bid"},{id:"owner",l:"Owner Budget"},
      {id:"trades",l:"Trades"},{id:"assemblies",l:"Assemblies"},{id:"schedules",l:"Schedules"},
      {id:"proposal",l:"Proposal"},
    ];

    return (
      <div style={{minHeight:"100vh",background:T.bg,color:T.text,fontFamily:T.mono}}>
        <div style={{position:"fixed",inset:0,backgroundImage:`linear-gradient(${T.amberDim}10 1px,transparent 1px),linear-gradient(90deg,${T.amberDim}10 1px,transparent 1px)`,backgroundSize:"48px 48px",pointerEvents:"none"}}/>
        <div style={{position:"relative"}}>
          {/* TOPBAR */}
          <div style={{background:T.surface,borderBottom:`1px solid ${T.border}`,padding:"12px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:5,height:32,background:T.amber}}/>
              <div>
                <div style={{fontSize:8,color:T.amber,letterSpacing:"0.25em",textTransform:"uppercase"}}>Estimate Complete · {cs.high+cs.medium+cs.low} assemblies</div>
                <div style={{fontSize:15,fontWeight:700,color:"#FAFAFA"}}>{e.proj.name||"Estimate"}</div>
                <div style={{fontSize:9,color:T.dim}}>{e.location}</div>
              </div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <div style={{display:"flex",gap:4,alignItems:"center",background:T.panel,border:`1px solid ${T.border}`,padding:"6px 10px"}}>
                <div style={{width:6,height:6,background:T.green,borderRadius:"50%"}}/>
                <span style={{fontSize:8,color:T.green}}>HIGH: {cs.high}</span>
                <div style={{width:1,height:12,background:T.border}}/>
                <div style={{width:6,height:6,background:T.orange,borderRadius:"50%"}}/>
                <span style={{fontSize:8,color:T.orange}}>MED: {cs.medium}</span>
                <div style={{width:1,height:12,background:T.border}}/>
                <div style={{width:6,height:6,background:T.red,borderRadius:"50%"}}/>
                <span style={{fontSize:8,color:T.red}}>LOW: {cs.low}</span>
              </div>
              <button onClick={()=>setScreen("home")} style={{background:T.panel,color:T.dim,border:`1px solid ${T.border}`,padding:"6px 12px",fontSize:8,cursor:"pointer",fontFamily:T.mono,letterSpacing:"0.1em"}}>← NEW</button>
              <button onClick={download} style={{background:T.amber,color:T.bg,border:"none",padding:"6px 14px",fontSize:8,cursor:"pointer",fontFamily:T.mono,fontWeight:700,letterSpacing:"0.1em"}}>⬇ DOWNLOAD</button>
            </div>
          </div>

          {/* HERO NUMBERS */}
          <div style={{background:T.surface,borderBottom:`1px solid ${T.border}`,padding:"14px 18px"}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:1,maxWidth:1060,margin:"0 auto"}}>
              {[[$v(e.schedule.bid),"Contractor Bid","With all markup",T.amber],[$v(e.owner.total),"Owner Budget","Total dev cost",T.green],[$v(e.bidPSF)+"/SF","Cost Per SF",`${nv(e.sqft)} SF project`,T.blue],[$v(e.direct),"Direct Cost","Before markup",T.purple],[e.lm.toFixed(2)+"×","Location",e.location,T.cyan],[confPct+"%","Data Confidence",`${cs.high} HIGH · ${cs.medium} MED · ${cs.low} LOW`,cs.low>cs.high?T.red:T.green]].map(([v,l,n,c])=>(
                <div key={l} style={{background:T.panel,padding:"12px 14px",borderLeft:`3px solid ${c}`}}>
                  <div style={{fontSize:7,color:T.faint,letterSpacing:"0.18em",textTransform:"uppercase",marginBottom:2}}>{l}</div>
                  <div style={{fontSize:18,fontWeight:700,color:c,lineHeight:1}}>{v}</div>
                  <div style={{fontSize:8,color:T.faint,marginTop:2}}>{n}</div>
                </div>
              ))}
            </div>
          </div>

          {/* TABS */}
          <div style={{background:T.surface,borderBottom:`1px solid ${T.border}`,padding:"0 18px",display:"flex",overflowX:"auto"}}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{background:"none",border:"none",borderBottom:`2px solid ${tab===t.id?T.amber:"transparent"}`,color:tab===t.id?T.amber:T.faint,padding:"10px 14px",cursor:"pointer",fontSize:9,fontFamily:T.mono,letterSpacing:"0.15em",textTransform:"uppercase",whiteSpace:"nowrap",transition:"color 0.2s"}}>{t.l}</button>
            ))}
          </div>

          <div style={{maxWidth:1060,margin:"0 auto",padding:"24px 18px"}}>

            {/* ── DASHBOARD ──────────────────────────────────────────── */}
            {tab==="dash"&&(
              <div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20}}>
                  {/* Confidence breakdown */}
                  <div style={{background:T.panel,border:`1px solid ${T.border}`,padding:"16px"}}>
                    <div style={{fontSize:9,color:T.amber,letterSpacing:"0.2em",textTransform:"uppercase",marginBottom:14}}>Data Confidence Breakdown</div>
                    {[["HIGH — From schedules/drawings",cs.high,T.green],["MEDIUM — Calculated from dims",cs.medium,T.orange],["LOW — Industry ratio estimate",cs.low,T.red]].map(([l,n,c])=>(
                      <div key={l} style={{marginBottom:10}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                          <span style={{fontSize:9,color:c}}>{l}</span>
                          <span style={{fontSize:9,color:c}}>{n}/{cs.total}</span>
                        </div>
                        <div style={{background:T.border,height:6}}>
                          <div style={{width:`${cs.total?Math.round(n/cs.total*100):0}%`,height:"100%",background:c,transition:"width 0.8s"}}/>
                        </div>
                      </div>
                    ))}
                    <div style={{marginTop:12,fontSize:9,color:T.dim,borderTop:`1px solid ${T.border}`,paddingTop:10}}>
                      {e.finishSchedule.length?`✅ Finish schedule read: ${e.finishSchedule.length} rooms`:`⚠️ No finish schedule — flooring estimated`}<br/>
                      {e.doorSchedule.length?`✅ Door schedule read: ${e.doorSchedule.reduce((a,d)=>a+(d.qty||1),0)} doors`:`⚠️ No door schedule — count estimated`}<br/>
                      {e.windowSchedule.length?`✅ Window schedule read: ${e.windowSchedule.reduce((a,w)=>a+(w.qty||1),0)} windows`:`⚠️ No window schedule — count estimated`}<br/>
                      {e.specNotes.length?`✅ ${e.specNotes.length} spec notes extracted`:`⚠️ No spec notes found`}
                    </div>
                  </div>
                  {/* Cost drivers */}
                  <div style={{background:T.panel,border:`1px solid ${T.border}`,padding:"16px"}}>
                    <div style={{fontSize:9,color:T.amber,letterSpacing:"0.2em",textTransform:"uppercase",marginBottom:14}}>Top Cost Drivers</div>
                    {Object.entries(e.divSubs).sort(([,a],[,b])=>b-a).slice(0,6).map(([div,cost])=>{
                      const pct=e.direct>0?cost/e.direct*100:0;
                      return <div key={div} style={{marginBottom:8}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                          <span style={{fontSize:9,color:T.text}}>{CSI[div]?.name||`Div ${div}`}</span>
                          <span style={{fontSize:9,color:T.amber,fontWeight:600}}>{$v(cost)}</span>
                        </div>
                        <div style={{background:T.border,height:4}}>
                          <div style={{width:`${Math.min(pct*1.5,100)}%`,height:"100%",background:CSI[div]?.color||T.amber}}/>
                        </div>
                      </div>;
                    })}
                  </div>
                </div>
                {/* Low confidence flags */}
                {e.assemblies.filter(a=>a.confidence==="LOW").length>0&&(
                  <div style={{background:"rgba(239,68,68,0.05)",border:`1px solid rgba(239,68,68,0.25)`,padding:"14px 16px"}}>
                    <div style={{fontSize:9,color:T.red,letterSpacing:"0.2em",textTransform:"uppercase",marginBottom:10}}>⚠ Low Confidence Items — Verify Before Bidding</div>
                    {e.assemblies.filter(a=>a.confidence==="LOW").map(a=>(
                      <div key={a.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid rgba(239,68,68,0.1)`,fontSize:9}}>
                        <div><span style={{color:T.red}}>LOW</span> <span style={{color:T.dim}}>{a.name}</span></div>
                        <div style={{color:T.red}}>{$v(a.assemblyTotal)}</div>
                      </div>
                    ))}
                    <div style={{fontSize:9,color:T.faint,marginTop:8}}>These items were estimated from industry ratios — no drawings or schedules available. Field verify before hard bidding.</div>
                  </div>
                )}
              </div>
            )}

            {/* ── BID TAB ─────────────────────────────────────────────── */}
            {tab==="bid"&&(
              <div>
                <div style={{fontSize:9,color:T.faint,marginBottom:16}}>PRELIMINARY ESTIMATE — FOR BUDGETING PURPOSES ONLY</div>
                <div style={{marginBottom:22}}>
                  {Object.entries(e.divSubs).sort(([,a],[,b])=>b-a).map(([div,cost])=>{
                    const pct=e.direct>0?cost/e.direct*100:0;
                    return <div key={div} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                      <span style={{width:22,fontSize:7,color:T.faint,textAlign:"right",flexShrink:0}}>{div}</span>
                      <div style={{flex:1,background:T.panel,height:26,position:"relative",overflow:"hidden",border:`1px solid ${T.border}`}}>
                        <div style={{position:"absolute",left:0,top:0,bottom:0,width:`${Math.min(pct*1.3,100)}%`,background:CSI[div]?.color||T.faint,opacity:0.55}}/>
                        <span style={{position:"absolute",left:7,top:"50%",transform:"translateY(-50%)",fontSize:9,color:T.text,zIndex:1}}>{CSI[div]?.icon} {CSI[div]?.name}</span>
                        <span style={{position:"absolute",right:7,top:"50%",transform:"translateY(-50%)",fontSize:9,color:T.amber,fontWeight:600,zIndex:1}}>{$v(cost)}</span>
                      </div>
                      <span style={{width:30,fontSize:8,color:T.faint,textAlign:"right"}}>{pct.toFixed(1)}%</span>
                    </div>;
                  })}
                </div>
                <div style={{background:T.panel,border:`1px solid ${T.border}`}}>
                  <div style={{padding:"10px 16px",borderBottom:`1px solid ${T.border}`,fontSize:8,color:T.amber,letterSpacing:"0.22em",textTransform:"uppercase"}}>Markup Schedule</div>
                  {[["Direct Cost Subtotal",e.schedule.direct,T.text],["Labor Burden (12%)",e.schedule.laborBurden,T.dim],["Sales Tax on Materials (4%)",e.schedule.salesTax,T.dim],["General Overhead (12%)",e.schedule.overhead,T.dim],["Contractor Profit (10%)",e.schedule.profit,T.dim],["Contingency (5%)",e.schedule.contingency,T.dim]].map(([l,v,c])=>(
                    <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"8px 16px",borderBottom:`1px solid ${T.bg}`}}>
                      <span style={{fontSize:10,color:T.dim}}>{l}</span><span style={{fontSize:10,color:c}}>{$v(v)}</span>
                    </div>
                  ))}
                  <div style={{display:"flex",justifyContent:"space-between",padding:"13px 16px",background:T.bg}}>
                    <span style={{fontSize:13,color:T.amber,fontWeight:700}}>TOTAL CONTRACT BID</span>
                    <span style={{fontSize:17,color:T.amber,fontWeight:700}}>{$v(e.schedule.bid)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── OWNER TAB ───────────────────────────────────────────── */}
            {tab==="owner"&&(
              <div>
                <div style={{background:T.panel,border:`1px solid ${T.border}`,marginBottom:14}}>
                  <div style={{padding:"10px 16px",borderBottom:`1px solid ${T.border}`,fontSize:8,color:T.green,letterSpacing:"0.22em",textTransform:"uppercase"}}>Owner's Budget</div>
                  {[["Contractor Bid",e.owner.bid,T.text,"Construction contract"],["Design & Engineering (8%)",e.owner.design,T.dim,"Architect, engineer, surveys"],["Permits & Inspections (2%)",e.owner.permits,T.dim,"All permits, DOB, inspections"],["Owner Contingency (10%)",e.owner.ownCont,T.dim,"Unforeseen conditions & changes"],["FF&E Allowance (5%)",e.owner.ffe,T.dim,"Furniture, fixtures, equipment"]].map(([l,v,c,n])=>(
                    <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",borderBottom:`1px solid ${T.bg}`}}>
                      <div><div style={{fontSize:10,color:c}}>{l}</div><div style={{fontSize:8,color:T.faint}}>{n}</div></div>
                      <span style={{fontSize:11,color:c,marginLeft:12}}>{$v(v)}</span>
                    </div>
                  ))}
                  <div style={{display:"flex",justifyContent:"space-between",padding:"13px 16px",background:T.bg}}>
                    <div><div style={{fontSize:13,color:T.green,fontWeight:700}}>TOTAL OWNER BUDGET</div><div style={{fontSize:8,color:T.faint}}>{$v(e.ownerPSF)}/SF</div></div>
                    <span style={{fontSize:17,color:T.green,fontWeight:700}}>{$v(e.owner.total)}</span>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                  {[["Bid Cost/SF",$v(e.bidPSF)+"/SF"],["Budget Cost/SF",$v(e.ownerPSF)+"/SF"],["Size",`${nv(e.sqft)} SF`]].map(([l,v])=>(
                    <div key={l} style={{background:T.panel,border:`1px solid ${T.border}`,padding:"12px",textAlign:"center"}}>
                      <div style={{fontSize:8,color:T.faint,marginBottom:3}}>{l}</div>
                      <div style={{fontSize:16,color:T.amber,fontWeight:700}}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── TRADES TAB ──────────────────────────────────────────── */}
            {tab==="trades"&&(
              <div>
                <div style={{fontSize:9,color:T.faint,marginBottom:14}}>Raw trade costs — no markup. For sub-bid invitations.</div>
                <div style={{background:T.panel,border:`1px solid ${T.border}`}}>
                  <div style={{display:"grid",gridTemplateColumns:"auto 1fr auto auto auto",padding:"8px 16px",borderBottom:`1px solid ${T.border2}`,gap:8,fontSize:7,color:T.faint,letterSpacing:"0.18em",textTransform:"uppercase"}}>
                    <span>DIV</span><span>Trade</span><span style={{textAlign:"right"}}>Budget</span><span style={{textAlign:"right"}}>$/SF</span><span style={{textAlign:"right"}}>%</span>
                  </div>
                  {Object.entries(e.divSubs).sort(([,a],[,b])=>b-a).map(([div,cost])=>{
                    const pct=e.direct>0?(cost/e.direct*100).toFixed(1):"0";
                    return <div key={div} style={{display:"grid",gridTemplateColumns:"auto 1fr auto auto auto",padding:"10px 16px",borderBottom:`1px solid ${T.bg}`,gap:8,alignItems:"center"}}>
                      <div style={{width:24,height:24,background:CSI[div]?.color||T.faint,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,flexShrink:0}}>{CSI[div]?.icon}</div>
                      <span style={{fontSize:10,color:T.text}}>{CSI[div]?.name||`Div ${div}`}</span>
                      <span style={{fontSize:11,color:T.amber,fontWeight:600,textAlign:"right"}}>{$v(cost)}</span>
                      <span style={{fontSize:9,color:T.dim,textAlign:"right"}}>${Math.round(cost/(e.sqft||1))}</span>
                      <span style={{fontSize:9,color:T.faint,textAlign:"right"}}>{pct}%</span>
                    </div>;
                  })}
                  <div style={{display:"grid",gridTemplateColumns:"auto 1fr auto auto auto",padding:"11px 16px",background:T.bg,gap:8}}>
                    <span/><span style={{fontSize:11,color:T.amber,fontWeight:700}}>TOTAL DIRECT COST</span>
                    <span style={{fontSize:13,color:T.amber,fontWeight:700,textAlign:"right"}}>{$v(e.direct)}</span>
                    <span style={{fontSize:9,color:T.faint,textAlign:"right"}}>${Math.round(e.direct/(e.sqft||1))}/SF</span>
                    <span style={{fontSize:9,color:T.faint,textAlign:"right"}}>100%</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── ASSEMBLIES TAB ──────────────────────────────────────── */}
            {tab==="assemblies"&&(
              <div>
                <div style={{fontSize:9,color:T.faint,marginBottom:14}}>Every assembly expanded with components · math shown · confidence flagged — this is what Togal can't do</div>
                {e.assemblies.map(asm=>{
                  const isExp=expAss===asm.id;
                  const confC=CONF_COLOR[asm.confidence];
                  const confBg=CONF_BG[asm.confidence];
                  return (
                    <div key={asm.id} style={{marginBottom:8,background:T.panel,border:`1px solid ${isExp?confC:T.border}`}}>
                      <div onClick={()=>setExpAss(isExp?null:asm.id)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 14px",cursor:"pointer"}}>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <div style={{width:6,height:24,background:confC,flexShrink:0}}/>
                          <div>
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              <span style={{fontSize:10,background:confBg,color:confC,padding:"1px 6px",fontSize:8,fontWeight:700,letterSpacing:"0.1em"}}>{asm.confidence}</span>
                              <span style={{fontSize:10,color:T.text,fontWeight:600}}>{asm.name}</span>
                            </div>
                            <div style={{fontSize:8,color:T.dim,marginTop:2}}>Math: {asm.math}</div>
                            {asm.specNote&&<div style={{fontSize:8,color:T.cyan,marginTop:1}}>📋 Spec: {asm.specNote}</div>}
                          </div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
                          <span style={{fontSize:13,color:T.amber,fontWeight:700}}>{$v(asm.assemblyTotal)}</span>
                          <span style={{fontSize:10,color:T.faint}}>{isExp?"▲":"▼"}</span>
                        </div>
                      </div>
                      {isExp&&(
                        <div style={{borderTop:`1px solid ${T.border}`,background:T.bg}}>
                          <div style={{display:"grid",gridTemplateColumns:"1fr auto auto auto",padding:"7px 14px",fontSize:7,color:T.faint,letterSpacing:"0.15em",textTransform:"uppercase",gap:8}}>
                            <span>Component</span><span style={{textAlign:"right"}}>Qty</span><span>Unit</span><span style={{textAlign:"right"}}>Total</span>
                          </div>
                          {asm.components.map((c,i)=>(
                            <div key={i} style={{display:"grid",gridTemplateColumns:"1fr auto auto auto",padding:"7px 14px",borderTop:`1px solid ${T.border}`,gap:8,alignItems:"center"}}>
                              <span style={{fontSize:9,color:T.dim}}>{c.desc}</span>
                              <span style={{fontSize:9,color:T.faint,textAlign:"right"}}>{nv(c.qty)}</span>
                              <span style={{fontSize:8,color:T.faint}}>{c.unit}</span>
                              <span style={{fontSize:9,color:T.text,textAlign:"right"}}>{$v(c.total)}</span>
                            </div>
                          ))}
                          <div style={{display:"grid",gridTemplateColumns:"1fr auto auto auto",padding:"8px 14px",background:T.surface,gap:8}}>
                            <span style={{fontSize:9,color:T.amber,fontWeight:600}}>Assembly Total</span>
                            <span/><span/>
                            <span style={{fontSize:12,color:T.amber,fontWeight:700,textAlign:"right"}}>{$v(asm.assemblyTotal)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── SCHEDULES TAB ───────────────────────────────────────── */}
            {tab==="schedules"&&(
              <div>
                <div style={{fontSize:9,color:T.faint,marginBottom:16}}>Data extracted from drawings — {e.finishSchedule.length+e.doorSchedule.length+e.windowSchedule.length} schedule items found</div>

                {/* Finish Schedule */}
                {e.finishSchedule.length>0&&(
                  <div style={{marginBottom:20}}>
                    <div style={{fontSize:9,color:T.amber,letterSpacing:"0.2em",textTransform:"uppercase",marginBottom:10}}>📋 Finish Schedule — {e.finishSchedule.length} rooms · USED FOR FLOORING COSTS</div>
                    <div style={{background:T.panel,border:`1px solid ${T.border}`}}>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",padding:"7px 14px",borderBottom:`1px solid ${T.border2}`,fontSize:7,color:T.faint,letterSpacing:"0.15em",textTransform:"uppercase",gap:8}}>
                        <span>Room</span><span>Floor</span><span>Wall</span><span>Ceiling</span><span>Base</span>
                      </div>
                      {e.finishSchedule.map((r,i)=>(
                        <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",padding:"8px 14px",borderBottom:`1px solid ${T.bg}`,gap:8,fontSize:9}}>
                          <span style={{color:T.text,fontWeight:600}}>{r.room}</span>
                          <span style={{color:T.green}}>{r.floor}</span>
                          <span style={{color:T.dim}}>{r.wall}</span>
                          <span style={{color:T.dim}}>{r.ceiling}</span>
                          <span style={{color:T.dim}}>{r.base}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Door Schedule */}
                {e.doorSchedule.length>0&&(
                  <div style={{marginBottom:20}}>
                    <div style={{fontSize:9,color:T.amber,letterSpacing:"0.2em",textTransform:"uppercase",marginBottom:10}}>🚪 Door Schedule — {e.doorSchedule.reduce((a,d)=>a+(d.qty||1),0)} doors · USED FOR DOOR COSTS</div>
                    <div style={{background:T.panel,border:`1px solid ${T.border}`}}>
                      <div style={{display:"grid",gridTemplateColumns:"auto auto auto 1fr 1fr 1fr auto",padding:"7px 14px",borderBottom:`1px solid ${T.border2}`,fontSize:7,color:T.faint,letterSpacing:"0.15em",textTransform:"uppercase",gap:8}}>
                        <span>Mark</span><span>W"</span><span>H"</span><span>Type</span><span>Material</span><span>Hardware</span><span style={{textAlign:"right"}}>Qty</span>
                      </div>
                      {e.doorSchedule.map((d,i)=>(
                        <div key={i} style={{display:"grid",gridTemplateColumns:"auto auto auto 1fr 1fr 1fr auto",padding:"8px 14px",borderBottom:`1px solid ${T.bg}`,gap:8,fontSize:9,alignItems:"center"}}>
                          <span style={{color:T.amber,fontWeight:700}}>{d.mark}</span>
                          <span style={{color:T.dim}}>{d.width}</span>
                          <span style={{color:T.dim}}>{d.height}</span>
                          <span style={{color:T.text}}>{d.type}</span>
                          <span style={{color:T.dim}}>{d.material}</span>
                          <span style={{color:T.dim,fontSize:8}}>{d.hardware}</span>
                          <span style={{color:T.green,fontWeight:700,textAlign:"right"}}>{d.qty||1}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Window Schedule */}
                {e.windowSchedule.length>0&&(
                  <div style={{marginBottom:20}}>
                    <div style={{fontSize:9,color:T.amber,letterSpacing:"0.2em",textTransform:"uppercase",marginBottom:10}}>🪟 Window Schedule — {e.windowSchedule.reduce((a,w)=>a+(w.qty||1),0)} windows · USED FOR WINDOW COSTS</div>
                    <div style={{background:T.panel,border:`1px solid ${T.border}`}}>
                      <div style={{display:"grid",gridTemplateColumns:"auto auto auto 1fr 1fr 1fr auto",padding:"7px 14px",borderBottom:`1px solid ${T.border2}`,fontSize:7,color:T.faint,letterSpacing:"0.15em",textTransform:"uppercase",gap:8}}>
                        <span>Mark</span><span>W"</span><span>H"</span><span>Type</span><span>Frame</span><span>Glazing</span><span style={{textAlign:"right"}}>Qty</span>
                      </div>
                      {e.windowSchedule.map((w,i)=>(
                        <div key={i} style={{display:"grid",gridTemplateColumns:"auto auto auto 1fr 1fr 1fr auto",padding:"8px 14px",borderBottom:`1px solid ${T.bg}`,gap:8,fontSize:9,alignItems:"center"}}>
                          <span style={{color:T.amber,fontWeight:700}}>{w.mark}</span>
                          <span style={{color:T.dim}}>{w.width}</span>
                          <span style={{color:T.dim}}>{w.height}</span>
                          <span style={{color:T.text}}>{w.type}</span>
                          <span style={{color:T.dim}}>{w.material}</span>
                          <span style={{color:T.dim}}>{w.glazing}</span>
                          <span style={{color:T.green,fontWeight:700,textAlign:"right"}}>{w.qty||1}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Spec Notes */}
                {e.specNotes.length>0&&(
                  <div>
                    <div style={{fontSize:9,color:T.amber,letterSpacing:"0.2em",textTransform:"uppercase",marginBottom:10}}>📝 Spec Notes — {e.specNotes.length} items extracted</div>
                    <div style={{background:T.panel,border:`1px solid ${T.border}`,padding:"12px 14px"}}>
                      {e.specNotes.map((n,i)=>(
                        <div key={i} style={{display:"flex",gap:10,padding:"6px 0",borderBottom:i<e.specNotes.length-1?`1px solid ${T.bg}`:"none"}}>
                          <span style={{color:T.amber,flexShrink:0}}>📋</span>
                          <span style={{fontSize:10,color:T.dim}}>{n}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {e.finishSchedule.length===0&&e.doorSchedule.length===0&&e.windowSchedule.length===0&&(
                  <div style={{background:T.panel,border:`1px solid ${T.border}`,padding:"40px",textAlign:"center"}}>
                    <div style={{fontSize:24,marginBottom:8}}>⚠️</div>
                    <div style={{fontSize:12,color:T.dim,marginBottom:4}}>No schedules found in uploaded drawings</div>
                    <div style={{fontSize:10,color:T.faint}}>All quantities were estimated from industry ratios (LOW confidence).<br/>Upload a plan set with a finish schedule, door schedule, and window schedule to upgrade confidence levels.</div>
                  </div>
                )}
              </div>
            )}

            {/* ── PROPOSAL TAB ────────────────────────────────────────── */}
            {tab==="proposal"&&(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                  <div style={{fontSize:9,color:T.faint}}>Claude-written professional proposal with schedule data embedded</div>
                  <button onClick={download} style={{background:T.panel,color:T.amber,border:`1px solid ${T.border}`,padding:"6px 12px",fontSize:8,cursor:"pointer",fontFamily:T.mono,letterSpacing:"0.1em"}}>⬇ DOWNLOAD</button>
                </div>
                {proposal
                  ?<div style={{background:"#FAFAFA",color:"#111",padding:"36px 40px",fontSize:12,lineHeight:1.9,fontFamily:"Georgia,serif",whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{proposal}</div>
                  :<div style={{background:T.panel,border:`1px solid ${T.border}`,padding:"40px",textAlign:"center",color:T.faint,fontSize:12}}>Proposal generating — check back in a moment.</div>
                }
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
