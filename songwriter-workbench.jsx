import { useState, useCallback, useMemo, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════
// MUSIC THEORY ENGINE
// ═══════════════════════════════════════════════════════════

const NOTES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

const noteIndex = (n) => {
  if (!n) return -1;
  const norm = String(n).trim()
    .replace(/db/i,"C#").replace(/eb/i,"D#").replace(/gb/i,"F#")
    .replace(/ab/i,"G#").replace(/bb/i,"A#");
  const upper = norm.charAt(0).toUpperCase() + norm.slice(1);
  return NOTES.indexOf(upper);
};

const addSemi = (note, s) => {
  const i = noteIndex(note);
  return i === -1 ? note : NOTES[(i + s + 1200) % 12];
};

const CHORD_TYPES = [
  { name:"Major",       abbrev:"",      quality:"major",   intervals:[0,4,7] },
  { name:"Minor",       abbrev:"m",     quality:"minor",   intervals:[0,3,7] },
  { name:"Dom 7th",     abbrev:"7",     quality:"dom",     intervals:[0,4,7,10] },
  { name:"Major 7th",   abbrev:"maj7",  quality:"major",   intervals:[0,4,7,11] },
  { name:"Minor 7th",   abbrev:"m7",    quality:"minor",   intervals:[0,3,7,10] },
  { name:"MinMaj 7th",  abbrev:"mMaj7", quality:"minor",   intervals:[0,3,7,11] },
  { name:"Diminished",  abbrev:"dim",   quality:"dim",     intervals:[0,3,6] },
  { name:"Dim 7th",     abbrev:"dim7",  quality:"dim",     intervals:[0,3,6,9] },
  { name:"Half-Dim",    abbrev:"m7b5",  quality:"dim",     intervals:[0,3,6,10] },
  { name:"Augmented",   abbrev:"aug",   quality:"aug",     intervals:[0,4,8] },
  { name:"Aug 7th",     abbrev:"aug7",  quality:"aug",     intervals:[0,4,8,10] },
  { name:"Sus 2",       abbrev:"sus2",  quality:"sus",     intervals:[0,2,7] },
  { name:"Sus 4",       abbrev:"sus4",  quality:"sus",     intervals:[0,5,7] },
  { name:"Add 9",       abbrev:"add9",  quality:"major",   intervals:[0,4,7,2] },
  { name:"Minor Add9",  abbrev:"madd9", quality:"minor",   intervals:[0,3,7,2] },
  { name:"6th",         abbrev:"6",     quality:"major",   intervals:[0,4,7,9] },
  { name:"Minor 6th",   abbrev:"m6",    quality:"minor",   intervals:[0,3,7,9] },
  { name:"9th",         abbrev:"9",     quality:"dom",     intervals:[0,4,7,10,2] },
  { name:"Major 9th",   abbrev:"maj9",  quality:"major",   intervals:[0,4,7,11,2] },
  { name:"Minor 9th",   abbrev:"m9",    quality:"minor",   intervals:[0,3,7,10,2] },
  { name:"Power",       abbrev:"5",     quality:"power",   intervals:[0,7] },
];

function identifyChord(notes) {
  if (!notes || notes.length < 2) return null;
  const unique = [...new Set(notes.map(n => { const i=noteIndex(n); return i>=0?NOTES[i]:null; }).filter(Boolean))];
  if (unique.length < 2) return null;
  let best = null;
  for (const root of unique) {
    for (const ct of CHORD_TYPES) {
      const cn = ct.intervals.map(i => addSemi(root, i));
      if (cn.every(n => unique.includes(n)) && unique.every(n => cn.includes(n))) {
        if (!best || ct.intervals.length > best.type.intervals.length)
          best = { root, type: ct };
      }
    }
  }
  return best;
}

function parseChordName(str) {
  if (!str) return null;
  const s = str.trim();
  const nm = s.match(/^([A-Ga-g][#b]?)/);
  if (!nm) return null;
  const raw = nm[1];
  const rootNote = raw.charAt(0).toUpperCase() + raw.slice(1).replace("B","#").replace("b","#");
  const ri = noteIndex(raw.charAt(0).toUpperCase() + raw.slice(1));
  if (ri < 0) return null;
  const root = NOTES[ri];
  const rest = s.slice(raw.length).toLowerCase().trim();
  const aliases = {"":"","maj":"","major":"","m":"m","min":"m","minor":"m","7":"7","maj7":"maj7","m7":"m7","dim":"dim","dim7":"dim7","aug":"aug","sus2":"sus2","sus4":"sus4","add9":"add9","6":"6","m6":"m6","9":"9","maj9":"maj9","m9":"m9","5":"5","aug7":"aug7","m7b5":"m7b5","mmaj7":"mMaj7","madd9":"madd9","mMaj7":"mMaj7"};
  const abbrev = aliases[rest] !== undefined ? aliases[rest] : rest;
  const ct = CHORD_TYPES.find(c => c.abbrev.toLowerCase() === abbrev.toLowerCase());
  if (ct) return { root, type: ct };
  // Unrecognised suffix — keep it as a custom chord so it can still be added
  return { root, type: { name: "Custom", abbrev: s.slice(raw.length).trim(), quality: "custom", intervals: [0], custom: true } };
}

// Build a chord-like object from a raw set of notes that didn't match any
// known chord shape. Uses the lowest selected note as a tentative root.
function makeCustomChord(notes, rootHint) {
  const unique = [...new Set(notes.map(n => { const i = noteIndex(n); return i >= 0 ? NOTES[i] : null; }).filter(Boolean))];
  if (unique.length === 0) return null;
  const root = rootHint && unique.includes(rootHint) ? rootHint : unique[0];
  const intervals = unique.map(n => (noteIndex(n) - noteIndex(root) + 12) % 12).sort((a, b) => a - b);
  return {
    root,
    type: { name: "Custom voicing", abbrev: "*", quality: "custom", intervals, custom: true, noteList: unique },
  };
}

const MODES = [
  { name:"Ionian",    short:"Major",         intervals:[0,2,4,5,7,9,11], degrees:["I","ii","iii","IV","V","vi","vii°"],   qualities:["major","minor","minor","major","dom","minor","dim"] },
  { name:"Dorian",    short:"Dorian",        intervals:[0,2,3,5,7,9,10], degrees:["i","ii","bIII","IV","v","vi°","bVII"], qualities:["minor","minor","major","dom","minor","dim","major"] },
  { name:"Phrygian",  short:"Phrygian",      intervals:[0,1,3,5,7,8,10], degrees:["i","bII","bIII","iv","v°","bVI","bvii"],qualities:["minor","major","major","minor","dim","major","minor"] },
  { name:"Lydian",    short:"Lydian",        intervals:[0,2,4,6,7,9,11], degrees:["I","II","iii","#iv°","V","vi","vii"],   qualities:["major","major","minor","dim","major","minor","minor"] },
  { name:"Mixolydian",short:"Mixolydian",    intervals:[0,2,4,5,7,9,10], degrees:["I","ii","iii°","IV","v","vi","bVII"],   qualities:["dom","minor","dim","major","minor","minor","major"] },
  { name:"Aeolian",   short:"Natural Minor", intervals:[0,2,3,5,7,8,10], degrees:["i","ii°","bIII","iv","v","bVI","bVII"], qualities:["minor","dim","major","minor","minor","major","major"] },
  { name:"Locrian",   short:"Locrian",       intervals:[0,1,3,5,6,8,10], degrees:["i°","bII","biii","iv","bV","bVI","bvii"],qualities:["dim","major","minor","minor","major","major","minor"] },
];

function findKeyContexts(chord) {
  if (!chord) return [];
  const { root, type } = chord;
  const ri = noteIndex(root);
  const results = [];
  const modeScore = [0,1,2,3,1,0,4];
  MODES.forEach((mode, mIdx) => {
    mode.intervals.forEach((iv, dIdx) => {
      const keyRoot = NOTES[(ri - iv + 12) % 12];
      const eq = mode.qualities[dIdx];
      const q = type.quality;
      const fits = q===eq || q==="power" || q==="sus" || (q==="major"&&eq==="dom") || (q==="dom"&&eq==="major");
      if (fits) results.push({ key:keyRoot, mode:mode.name, short:mode.short, degree:mode.degrees[dIdx], degreeIdx:dIdx, modeIdx:mIdx, modeIntervals:mode.intervals, modeDegrees:mode.degrees, modeQualities:mode.qualities });
    });
  });
  results.sort((a,b) => modeScore[a.modeIdx]-modeScore[b.modeIdx]);
  return results.slice(0,8);
}

function getDiatonic(kc) {
  if (!kc) return [];
  const ki = noteIndex(kc.key);
  return kc.modeIntervals.map((iv,i) => {
    const root = NOTES[(ki+iv)%12];
    const q = kc.modeQualities[i];
    const ct = CHORD_TYPES.find(c=>c.quality===q&&c.intervals.length===3)||CHORD_TYPES[0];
    return { root, type:ct, degree:kc.modeDegrees[i] };
  });
}

function getNextChords(kc, dIdx) {
  if (!kc) return [];
  const ki = noteIndex(kc.key);
  const motion = { 0:[4,5,3,1], 1:[4,0,5,3], 2:[3,5,0,1], 3:[0,4,1,5], 4:[0,5,1,3], 5:[3,1,4,0], 6:[0,4,5,3] };
  return (motion[dIdx]||[0,3,4,5]).slice(0,4).map(di => {
    const root = NOTES[(ki+kc.modeIntervals[di])%12];
    const q = kc.modeQualities[di];
    const ct = CHORD_TYPES.find(c=>c.quality===q&&c.intervals.length===3)||CHORD_TYPES[0];
    return { root, type:ct, degree:kc.modeDegrees[di], degreeIdx:di };
  });
}

// ── PROGRESSION KEY DETECTION ────────────────────────────────
// Score every key+mode against all chords in the progression.
// Returns the best-fitting key context plus per-chord fit info.
function analyzeProgression(progression) {
  if (!progression || progression.length === 0) return null;

  // Collect the pitch-class set actually used across the progression
  const chordRoots = progression.map(p => p.chord?.root).filter(Boolean);
  const allNotes = [];
  progression.forEach(p => {
    if (!p.chord || p.chord.type?.custom) return;
    p.chord.type.intervals.forEach(iv => allNotes.push(addSemi(p.chord.root, iv)));
  });
  if (allNotes.length === 0) return null;

  const candidates = [];
  for (let keyIdx = 0; keyIdx < 12; keyIdx++) {
    MODES.forEach((mode, mIdx) => {
      const scalePCs = mode.intervals.map(iv => (keyIdx + iv) % 12);
      // Score: how many chord-tones land in this scale + bonus for roots on scale degrees
      let inScale = 0, total = 0, rootBonus = 0;
      allNotes.forEach(n => { total++; if (scalePCs.includes(noteIndex(n))) inScale++; });
      chordRoots.forEach(r => { if (scalePCs.includes(noteIndex(r))) rootBonus += 1.5; });
      // Tonic emphasis: first & last chord roots matching the key root is a strong signal
      const firstRoot = noteIndex(chordRoots[0]);
      const lastRoot = noteIndex(chordRoots[chordRoots.length - 1]);
      let tonicBonus = 0;
      if (firstRoot === keyIdx) tonicBonus += 2;
      if (lastRoot === keyIdx) tonicBonus += 3;
      // Prefer common modes (Ionian/Aeolian) slightly
      const modePref = [3,1,0,1,1,3,0][mIdx];
      const score = (inScale / total) * 10 + rootBonus + tonicBonus + modePref;
      candidates.push({ keyIdx, mIdx, mode, score, inScale, total });
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const second = candidates[1];

  const keyRoot = NOTES[best.keyIdx];
  const kc = {
    key: keyRoot, mode: best.mode.name, short: best.mode.short,
    modeIdx: best.mIdx, modeIntervals: best.mode.intervals,
    modeDegrees: best.mode.degrees, modeQualities: best.mode.qualities,
  };

  // Confidence: clear margin over the runner-up AND enough chords
  const margin = second ? best.score - second.score : best.score;
  const confident = progression.length >= 3 && margin >= 1.5;

  // Per-chord: which are in-key, which are borrowed/outside
  const scalePCs = best.mode.intervals.map(iv => (best.keyIdx + iv) % 12);
  const chordFit = progression.map(p => {
    if (!p.chord || p.chord.type?.custom) return { inKey: null, degree: null };
    const tones = p.chord.type.intervals.map(iv => noteIndex(addSemi(p.chord.root, iv)));
    const inKey = tones.every(t => scalePCs.includes(t));
    const rootPC = noteIndex(p.chord.root);
    const degIdx = scalePCs.indexOf(rootPC);
    const degree = degIdx >= 0 ? best.mode.degrees[degIdx] : null;
    return { inKey, degree };
  });

  const fitPct = Math.round((best.inScale / best.total) * 100);
  return { kc, confident, margin, chordFit, fitPct, alternatives: candidates.slice(0, 4).map(c => ({ key: NOTES[c.keyIdx], mode: c.mode.name, modeIdx: c.mIdx, modeIntervals: c.mode.intervals, modeDegrees: c.mode.degrees, modeQualities: c.mode.qualities, short: c.mode.short })) };
}

// Best next-chord ideas given the WHOLE progression and detected key.
function getNextFromProgression(kc, progression) {
  if (!kc) return [];
  const ki = noteIndex(kc.key);
  // Find the degree of the last chord, if it's in-key
  const last = progression[progression.length - 1];
  let lastDeg = 0;
  if (last?.chord) {
    const scalePCs = kc.modeIntervals.map(iv => (ki + iv) % 12);
    const idx = scalePCs.indexOf(noteIndex(last.chord.root));
    if (idx >= 0) lastDeg = idx;
  }
  return getNextChords(kc, lastDeg);
}

function getModulations(kc, seed) {
  if (!kc) return [];
  const ki = noteIndex(kc.key);
  const res = [];
  if (kc.modeIdx===5) {
    const rm = NOTES[(ki+3)%12];
    res.push({ label:"Relative Major", key:rm, mode:"Ionian", pivot:`${rm}`, pivotAbbrev:"", desc:`→ ${rm} Major`, color:"#5FE3D8" });
  } else {
    const rmin = NOTES[(ki+9)%12];
    res.push({ label:"Relative Minor", key:rmin, mode:"Aeolian", pivot:rmin, pivotAbbrev:"m", desc:`→ ${rmin} Minor`, color:"#BCA4FF" });
  }
  const par = kc.modeIdx<=1 ? { key:kc.key, mode:"Aeolian", abbrev:"m", desc:`→ ${kc.key} Minor`, color:"#FFB224" } : { key:kc.key, mode:"Ionian", abbrev:"", desc:`→ ${kc.key} Major`, color:"#FFB224" };
  res.push({ label:"Parallel", ...par, pivot:kc.key, pivotAbbrev:par.abbrev });
  const offsets = [2,3,5,8,10,6,1,7];
  const randOffset = offsets[(seed)%offsets.length];
  const rk = NOTES[(ki+randOffset)%12];
  const dom = NOTES[(noteIndex(rk)+7)%12];
  res.push({ label:"Random Pivot", key:rk, mode:"Ionian", pivot:dom, pivotAbbrev:"7", desc:`→ ${rk} via ${dom}7`, color:"#FFA85A", isRandom:true });
  return res;
}

// ═══════════════════════════════════════════════════════════
// GENRE ENGINE
// ═══════════════════════════════════════════════════════════

const GENRES = {
  "Rock":       { desc:"Power chords, I-IV-V, pentatonic bends", bias:{power:2,major:1.5,minor:1}, progressions:["I-IV-V","I-bVII-IV","i-bVI-bIII-bVII"], preferredModes:["Ionian","Aeolian","Mixolydian"] },
  "Pop":        { desc:"Clean triads, predictable changes, hooks", bias:{major:2,minor:1.5,sus:1}, progressions:["I-V-vi-IV","I-IV-I-V","vi-IV-I-V"], preferredModes:["Ionian","Aeolian"] },
  "Jazz":       { desc:"Extended chords, ii-V-I, chromatic movement", bias:{dom:2,major:1.5,minor:1.5}, progressions:["ii-V-I","I-vi-ii-V","iii-VI-ii-V"], preferredModes:["Ionian","Dorian","Mixolydian","Lydian"] },
  "Blues":      { desc:"12-bar, dominant 7ths, call and response", bias:{dom:3,major:1}, progressions:["I7-IV7-V7","I-IV-I-V7-IV-I","I7-I7-IV7-IV7-I7-V7-IV7-I7"], preferredModes:["Mixolydian","Aeolian"] },
  "Folk":       { desc:"Open chords, diatonic movement, storytelling", bias:{major:2,sus:1.5,minor:1}, progressions:["I-IV-V","I-ii-IV-V","I-V-IV"], preferredModes:["Ionian","Mixolydian"] },
  "Country":    { desc:"Major triads, pedal steel feel, I-IV-V-I", bias:{major:2,dom:1.5}, progressions:["I-IV-V-I","I-ii-IV-V","I-V-IV-I"], preferredModes:["Ionian","Mixolydian"] },
  "Metal":      { desc:"Power chords, tritones, dark modes", bias:{power:3,dim:1.5,minor:1}, progressions:["i-bII-bVII","i-iv-bVI-bVII","i-bVII-bVI-v°"], preferredModes:["Phrygian","Aeolian","Locrian"] },
  "Classical":  { desc:"Voice leading, functional harmony, cadences", bias:{major:2,minor:2,dim:1}, progressions:["I-IV-V-I","i-iv-V-i","I-ii-V-I"], preferredModes:["Ionian","Aeolian","Dorian"] },
  "Indie":      { desc:"Unexpected chords, ambiguous tonality, texture", bias:{major:1.5,minor:1.5,sus:2}, progressions:["I-V-vi-iii","I-iii-IV-V","vi-I-V-IV"], preferredModes:["Ionian","Mixolydian","Lydian"] },
  "R&B":        { desc:"Soulful extensions, chromatic movement, groove", bias:{minor:2,dom:2,major:1}, progressions:["i-iv-v","ii-V-I","I-bVII-IV-I"], preferredModes:["Dorian","Aeolian","Mixolydian"] },
  "Funk":       { desc:"Dominant 7ths, syncopation, staying on one chord", bias:{dom:3,minor:1}, progressions:["I7","i7-IV7","I7-IV7-I7-V7"], preferredModes:["Mixolydian","Dorian"] },
  "Bossa Nova": { desc:"maj7/dom7, ii-V-I, Brazilian voice leading", bias:{major:2,dom:2,minor:1.5}, progressions:["IIm7-V7-Imaj7","I-VI7-ii-V","Imaj7-IV7-iii-VI7"], preferredModes:["Ionian","Lydian","Dorian"] },
  "Flamenco":   { desc:"Phrygian mode, Andalusian cadence, passion", bias:{minor:2,major:1,dom:1}, progressions:["i-bVII-bVI-V","i-iv-bVII-i","bII-i-bVII-i"], preferredModes:["Phrygian","Aeolian"] },
  "Custom":     { desc:"Define your own", bias:{}, progressions:[], preferredModes:[] },
};

// ═══════════════════════════════════════════════════════════
// STYLE PROFILER
// ═══════════════════════════════════════════════════════════

function buildStyleProfile(progression) {
  if (!progression || progression.length === 0) return null;
  const qualityCounts = {};
  const extensionCount = { simple:0, extended:0 };
  const patterns = {};
  let minorCount=0, majorCount=0, darkCount=0, jazzCount=0;

  progression.forEach((p, i) => {
    const q = p.chord.type.quality;
    qualityCounts[q] = (qualityCounts[q]||0)+1;
    if (p.chord.type.intervals.length > 3) extensionCount.extended++;
    else extensionCount.simple++;
    if (q==="minor"||q==="dim") minorCount++;
    if (q==="major"||q==="dom") majorCount++;
    if (q==="dim"||q==="aug") darkCount++;
    if (q==="dom"||p.chord.type.abbrev.includes("7")||p.chord.type.abbrev.includes("9")) jazzCount++;
    if (i>0) {
      const pattern = `${progression[i-1].chord.root}${progression[i-1].chord.type.abbrev}→${p.chord.root}${p.chord.type.abbrev}`;
      patterns[pattern]=(patterns[pattern]||0)+1;
    }
  });

  const total = progression.length;
  const topQualities = Object.entries(qualityCounts).sort((a,b)=>b[1]-a[1]).slice(0,3);
  const topPatterns = Object.entries(patterns).filter(([,v])=>v>1).sort((a,b)=>b[1]-a[1]).slice(0,3);

  const tonality = minorCount > majorCount*1.5 ? "Dark / Minor" : majorCount > minorCount*1.5 ? "Bright / Major" : "Balanced";
  const complexity = extensionCount.extended/total > 0.5 ? "Complex (extended chords)" : extensionCount.extended/total > 0.2 ? "Moderate" : "Simple (triads)";
  const mood = jazzCount/total>0.4 ? "Jazz-influenced" : darkCount/total>0.3 ? "Tense / Dramatic" : minorCount/total>0.5 ? "Melancholic" : "Uplifting";

  return { tonality, complexity, mood, topQualities, topPatterns, total };
}

// ═══════════════════════════════════════════════════════════
// TUNINGS + FRETBOARD
// ═══════════════════════════════════════════════════════════

const TUNINGS = {
  "Standard (EADGBe)":   ["E","A","D","G","B","E"],
  "Drop D":              ["D","A","D","G","B","E"],
  "Open G":              ["D","G","D","G","B","D"],
  "Open D":              ["D","A","D","F#","A","D"],
  "Open E":              ["E","B","E","G#","B","E"],
  "DADGAD":              ["D","A","D","G","A","D"],
  "Half Step Down (Eb)": ["Eb","Ab","Db","Gb","Bb","Eb"],
  "Full Step Down (D)":  ["D","G","C","F","A","D"],
  "Drop C":              ["C","G","C","F","A","D"],
  "Open A":              ["E","A","E","A","C#","E"],
};

const INLAY = new Set([3,5,7,9,12,15,17,19,21,24]);
const DBL_INLAY = new Set([12,24]);
const FRETS = 24;

const QC = { major:"#5FE3D8", minor:"#BCA4FF", dom:"#FFB224", dim:"#FF8A8A", aug:"#FFA85A", sus:"#4FE3AB", power:"#AEB8C6", custom:"#BCC2CE" };
const qc = (q) => QC[q] || "#5FE3D8";

// ═══════════════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════════════

const SK = "swb_v2_projects";
const loadProjects = () => { try { return JSON.parse(localStorage.getItem(SK)||"{}"); } catch { return {}; } };
const saveProjects = (p) => { try { localStorage.setItem(SK, JSON.stringify(p)); } catch {} };

// ═══════════════════════════════════════════════════════════
// AI EXPLAIN
// ═══════════════════════════════════════════════════════════

async function aiExplain(chord, keyContext, genre, styleProfile, progressionContext) {
  const chordName = `${chord.root}${chord.type.abbrev||""}`;
  const key = keyContext ? `${keyContext.key} ${keyContext.mode}` : "unknown key";
  const degree = keyContext?.degree || "?";
  const recent = progressionContext.slice(-4).map(p=>`${p.chord.root}${p.chord.type.abbrev||""}`).join(" → ");
  const style = styleProfile ? `Tonality: ${styleProfile.tonality}, Complexity: ${styleProfile.complexity}, Mood: ${styleProfile.mood}` : "Not enough data yet";

  const prompt = `You are a music theory expert and songwriter coach. Be concise but insightful (3-5 sentences max).

Current chord: ${chordName} (${degree} in ${key})
Genre: ${genre}
Recent progression: ${recent || "none yet"}
Writer's style profile: ${style}

Explain why ${chordName} works here and what makes it an interesting choice given this songwriter's style and genre. Be specific and practical.`;

  const resp = await fetch("/api/claude", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ prompt })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error || "AI request failed");
  return data.text || "Could not generate explanation.";
}

async function aiGenreSuggestion(genre, keyContext, styleProfile, progression) {
  const key = keyContext ? `${keyContext.key} ${keyContext.mode}` : "C Major";
  const recent = progression.slice(-4).map(p=>`${p.chord.root}${p.chord.type.abbrev||""}`).join(" → ");
  const style = styleProfile ? `Tonality: ${styleProfile.tonality}, Mood: ${styleProfile.mood}` : "just starting out";

  const prompt = `You are a music theory expert. Be concise and practical.

Genre: ${genre}
Current key: ${key}
Recent chords: ${recent || "none"}
Writer style: ${style}

Suggest 2-3 specific next chords that would be typical for ${genre} in this context. Format: just list the chords with a brief reason each. No preamble.`;

  const resp = await fetch("/api/claude", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ prompt })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error || "AI request failed");
  return data.text || "Could not generate suggestion.";
}

// ═══════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════

export default function SongwriterWorkbench() {
  const [tuningKey, setTuningKey] = useState("Standard (EADGBe)");
  const [customTuning, setCustomTuning] = useState(null);
  const [customInputs, setCustomInputs] = useState(["E","A","D","G","B","E"]);
  const [showCustom, setShowCustom] = useState(false);

  const [selectedFrets, setSelectedFrets] = useState({});
  const [textInput, setTextInput] = useState("");
  const [textChord, setTextChord] = useState(null);
  const [inputMode, setInputMode] = useState("fretboard");

  const [progression, setProgression] = useState([]);
  const [pinnedKC, setPinnedKC] = useState(null);

  const [genre, setGenre] = useState("Rock");
  const [customGenre, setCustomGenre] = useState("");
  const [showGenreInput, setShowGenreInput] = useState(false);

  const [projectName, setProjectName] = useState("Untitled");
  const [projects, setProjectsState] = useState(loadProjects());
  const [showProjects, setShowProjects] = useState(false);

  const [toast, setToast] = useState(null);
  const [randSeed, setRandSeed] = useState(0);

  const [aiModal, setAiModal] = useState(null); // {text, loading, title}
  const [aiLoading, setAiLoading] = useState(false);

  const [activeTab, setActiveTab] = useState("next"); // "next" | "diatonic" | "modulate" | "style"

  // Tuning gate — user must pick a tuning before entering the app
  const [started, setStarted] = useState(false);

  const tuning = customTuning || TUNINGS[tuningKey];

  const showToast = (msg) => { setToast(msg); setTimeout(()=>setToast(null), 2500); };

  const fretNotes = useMemo(() => Object.keys(selectedFrets).filter(k=>selectedFrets[k]).map(k=>{const[s,f]=k.split("-").map(Number);return addSemi(tuning[s],f);}), [selectedFrets, tuning]);

  const recognizedChord = inputMode==="text" ? textChord : identifyChord(fretNotes);
  // Fall back to a custom voicing so any selection of 2+ notes can still be added
  const workingChord = recognizedChord || (inputMode==="fretboard" && fretNotes.length>=2 ? makeCustomChord(fretNotes) : null);
  const workingNotes = inputMode==="text" ? (textChord && !textChord.type.custom ? textChord.type.intervals.map(i=>addSemi(textChord.root,i)) : (textChord?[textChord.root]:[])) : fretNotes;

  const keyContexts = useMemo(()=>findKeyContexts(workingChord),[workingChord]);

  // Analyse the WHOLE progression to find the project's key/mode
  const projectAnalysis = useMemo(()=>analyzeProgression(progression),[progression]);
  const projectKC = projectAnalysis?.kc || null;

  // Active key context priority: manual pin > project key > current chord's key
  const activeKC = pinnedKC || projectKC || keyContexts[0] || null;

  const diatonic = useMemo(()=>getDiatonic(activeKC),[activeKC]);

  const nextChords = useMemo(()=>{
    // Prefer suggestions based on the whole progression
    if (projectKC && progression.length>0 && !pinnedKC) {
      return getNextFromProgression(activeKC, progression);
    }
    if (!activeKC || !workingChord) return [];
    const ctx = keyContexts.find(k=>k.key===activeKC.key&&k.mode===activeKC.mode);
    return getNextChords(activeKC, ctx?.degreeIdx??0);
  },[activeKC, workingChord, keyContexts, projectKC, progression, pinnedKC]);

  const modulations = useMemo(()=>getModulations(activeKC, randSeed),[activeKC, randSeed]);

  const styleProfile = useMemo(()=>buildStyleProfile(progression),[progression]);

  // Genre-biased diatonic: sort by genre quality bias
  const genreData = GENRES[genre] || GENRES["Rock"];
  const biasedDiatonic = useMemo(()=>{
    if (!genreData.bias || Object.keys(genreData.bias).length===0) return diatonic;
    return [...diatonic].sort((a,b)=>{
      const ba = genreData.bias[a.type.quality]||0;
      const bb = genreData.bias[b.type.quality]||0;
      return bb-ba;
    });
  },[diatonic, genreData]);

  const addToProgression = useCallback((chord, kc) => {
    if (!chord) return;
    setProgression(prev=>[...prev,{chord,keyContext:kc||activeKC,notes:chord.type.intervals.map(i=>addSemi(chord.root,i))}]);
    setSelectedFrets({});
    setTextInput("");
    setTextChord(null);
  },[activeKC]);

  const handleTextInput = (val) => {
    setTextInput(val);
    setTextChord(parseChordName(val));
  };

  const handleExplain = async (chord, kc, label) => {
    setAiModal({ title: `Why ${chord.root}${chord.type.abbrev||""}? ${label||""}`, text:"", loading:true });
    try {
      const text = await aiExplain(chord, kc||activeKC, genre, styleProfile, progression);
      setAiModal({ title:`Why ${chord.root}${chord.type.abbrev||""}? ${label||""}`, text, loading:false });
    } catch(e) {
      setAiModal({ title:"Error", text:"AI unavailable. Check your connection.", loading:false });
    }
  };

  const handleAiGenre = async () => {
    setAiModal({ title:`${genre} suggestions`, text:"", loading:true });
    try {
      const text = await aiGenreSuggestion(genre, activeKC, styleProfile, progression);
      setAiModal({ title:`${genre} suggestions`, text, loading:false });
    } catch(e) {
      setAiModal({ title:"Error", text:"AI unavailable.", loading:false });
    }
  };

  const saveProject = () => {
    const updated = {...projects,[projectName]:{name:projectName,progression,tuningKey,customTuning,genre,savedAt:new Date().toISOString()}};
    setProjectsState(updated); saveProjects(updated); showToast(`"${projectName}" saved`);
  };
  const loadProject = (name) => {
    const p = projects[name]; if(!p)return;
    setProjectName(p.name); setProgression(p.progression||[]);
    setTuningKey(p.tuningKey||"Standard (EADGBe)"); setCustomTuning(p.customTuning||null);
    if(p.genre) setGenre(p.genre);
    setShowProjects(false); setPinnedKC(null); showToast(`"${name}" loaded`);
  };
  const deleteProject = (name) => {
    const updated={...projects}; delete updated[name]; setProjectsState(updated); saveProjects(updated);
  };
  const exportProject = () => {
    const blob=new Blob([JSON.stringify({name:projectName,progression,tuningKey,customTuning,genre},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a");
    a.href=url; a.download=`${projectName.replace(/\s+/g,"-")}.json`; a.click(); URL.revokeObjectURL(url);
  };
  const importProject = (e) => {
    const file=e.target.files[0]; if(!file)return;
    const r=new FileReader(); r.onload=(ev)=>{try{const d=JSON.parse(ev.target.result);setProjectName(d.name||"Imported");setProgression(d.progression||[]);setTuningKey(d.tuningKey||"Standard (EADGBe)");setCustomTuning(d.customTuning||null);if(d.genre)setGenre(d.genre);showToast("Imported");}catch{showToast("Import failed");}};r.readAsText(file);
  };

  const cc = workingChord ? qc(workingChord.type.quality) : "#5FE3D8";

  // ── RENDER ────────────────────────────────────────────────
  // ── TUNING GATE ───────────────────────────────────────────
  if (!started) {
    const sharedFontStyle = `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');`;
    return (
      <div style={{fontFamily:"'Space Grotesk',system-ui,sans-serif",background:"#0B0804",minHeight:"100vh",color:"#F7F0E2",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
        <style>{`
          ${sharedFontStyle}
          *{box-sizing:border-box;margin:0;padding:0;}
          .gate-btn{cursor:pointer;transition:all 0.14s;border:1px solid #4A3820;background:#120D06;color:#F7F0E2;font-family:'DM Mono',monospace;text-align:left;}
          .gate-btn:hover{border-color:#E8C661;background:#1A1308;transform:translateY(-1px);}
          .gate-btn.sel{border-color:#E8C661;background:#1A1308;box-shadow:0 0 0 1px #E8C661;}
          input{font-family:'DM Mono',monospace;}
        `}</style>
        <div style={{maxWidth:560,width:"100%",animation:"none"}}>
          {/* Logo */}
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:6,justifyContent:"center"}}>
            <div style={{width:42,height:42,background:"linear-gradient(135deg,#E8C661,#7A5A10)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>🎸</div>
            <div style={{fontSize:24,fontWeight:700,letterSpacing:"-0.02em"}}>Songwriter's Workbench</div>
          </div>
          <div style={{textAlign:"center",fontSize:13,color:"#C9A468",marginBottom:28}}>First, which tuning are you playing in?</div>

          {/* Tuning grid */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:18}}>
            {Object.entries(TUNINGS).map(([name,notes])=>{
              const sel = !customTuning && tuningKey===name;
              return (
                <button key={name} className={`gate-btn${sel?" sel":""}`} onClick={()=>{setTuningKey(name);setCustomTuning(null);}} style={{padding:"11px 13px",borderRadius:9,display:"flex",flexDirection:"column",gap:3}}>
                  <span style={{fontSize:13,fontWeight:600,color:sel?"#E8C661":"#F7F0E2",fontFamily:"'Space Grotesk',sans-serif"}}>{name.replace(/\s*\(.*\)/,"")}</span>
                  <span style={{fontSize:11,color:"#BE9A5E",letterSpacing:"0.08em"}}>{notes.join(" ")}</span>
                </button>
              );
            })}
          </div>

          {/* Custom tuning */}
          <div style={{background:"#171108",border:`1px solid ${customTuning?"#E8C661":"#3E3018"}`,borderRadius:10,padding:"13px 15px",marginBottom:22}}>
            <div style={{fontSize:11,color:"#C9A468",fontFamily:"'DM Mono',monospace",letterSpacing:"0.08em",marginBottom:9}}>OR ENTER A CUSTOM TUNING (low → high)</div>
            <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}>
              {customInputs.map((n,i)=>(
                <input key={i} value={n} maxLength={2} onChange={e=>{const v=[...customInputs];v[i]=e.target.value.toUpperCase();setCustomInputs(v);}} style={{width:40,background:"#0B0804",border:"1px solid #4A3820",color:"#F7F0E2",padding:"7px",borderRadius:6,fontSize:14,textAlign:"center",outline:"none"}}/>
              ))}
              <button className="gate-btn" onClick={()=>setCustomTuning([...customInputs])} style={{padding:"7px 14px",borderRadius:6,fontSize:12,color:customTuning?"#E8C661":"#C9A468"}}>{customTuning?"✓ Using custom":"Use custom"}</button>
            </div>
          </div>

          {/* Enter */}
          <button className="gate-btn" onClick={()=>setStarted(true)} style={{width:"100%",padding:"14px",borderRadius:10,background:"#E8C661",border:"none",color:"#0B0804",fontSize:15,fontWeight:700,textAlign:"center",fontFamily:"'Space Grotesk',sans-serif"}}>
            Enter Workbench — {customTuning ? customInputs.join(" ") : tuningKey.replace(/\s*\(.*\)/,"")} →
          </button>
          <div style={{textAlign:"center",fontSize:11,color:"#9A7C48",marginTop:12}}>You can change tuning any time from inside the app.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{fontFamily:"'Space Grotesk',system-ui,sans-serif",background:"#0B0804",minHeight:"100vh",color:"#F7F0E2",userSelect:"none",fontSize:13}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:3px;height:3px;}
        ::-webkit-scrollbar-track{background:#0B0804;}
        ::-webkit-scrollbar-thumb{background:#8A6E40;border-radius:2px;}
        .btn{cursor:pointer;transition:all 0.12s;border:none;font-family:'Space Grotesk',sans-serif;font-size:11px;}
        .btn:hover{filter:brightness(1.18);}
        .btn:active{transform:scale(0.97);}
        .pill{cursor:pointer;transition:all 0.12s;}
        .pill:hover{filter:brightness(1.2);transform:translateY(-1px);}
        .fc{cursor:pointer;}
        .fc:hover .dn{opacity:0.65;transform:scale(1.1);}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .label{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:0.1em;color:#B89456;text-transform:uppercase;}
      `}</style>

      {/* TOAST */}
      {toast&&<div style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",background:"#E8C661",color:"#0B0804",padding:"7px 18px",borderRadius:20,fontSize:12,fontWeight:700,zIndex:9999,animation:"fadeIn 0.2s ease",pointerEvents:"none"}}>{toast}</div>}

      {/* AI MODAL */}
      {aiModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setAiModal(null)}>
          <div style={{background:"#1C1409",border:"1px solid #4A3820",borderRadius:12,padding:24,maxWidth:500,width:"100%",animation:"fadeIn 0.2s ease"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:700,color:"#E8C661"}}>{aiModal.title}</div>
              <button className="btn" onClick={()=>setAiModal(null)} style={{background:"transparent",color:"#A98A52",fontSize:16,padding:"0 4px"}}>✕</button>
            </div>
            {aiModal.loading ? (
              <div style={{display:"flex",alignItems:"center",gap:10,color:"#A98A52",fontSize:12}}>
                <div style={{width:16,height:16,border:"2px solid #8A6E40",borderTopColor:"#E8C661",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
                Asking Claude...
              </div>
            ) : (
              <div style={{fontSize:13,lineHeight:1.7,color:"#DCCBA8",whiteSpace:"pre-wrap"}}>{aiModal.text}</div>
            )}
          </div>
        </div>
      )}

      {/* HEADER */}
      <div style={{background:"#090604",borderBottom:"1px solid #241A0D",padding:"9px 16px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginRight:6}}>
          <div style={{width:30,height:30,background:"linear-gradient(135deg,#E8C661,#7A5A10)",borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>🎸</div>
          <div>
            <div style={{fontSize:14,fontWeight:700,letterSpacing:"-0.02em"}}>Songwriter's Workbench</div>
            <div className="label">Chord · Key · Style · AI</div>
          </div>
        </div>

        <input value={projectName} onChange={e=>setProjectName(e.target.value)} style={{background:"transparent",border:"none",borderBottom:"1px solid #4A3820",color:"#E8C661",fontSize:12,fontWeight:600,padding:"1px 3px",width:140,outline:"none"}} placeholder="Project name..."/>

        {/* Genre */}
        <div style={{display:"flex",alignItems:"center",gap:4,marginLeft:4}}>
          <span className="label" style={{marginRight:2}}>Genre:</span>
          <select value={genre} onChange={e=>{const v=e.target.value;setGenre(v);setShowGenreInput(v==="Custom");}} style={{background:"#1C1409",border:"1px solid #4A3820",color:"#E8C661",padding:"4px 6px",borderRadius:5,fontSize:11,fontFamily:"'DM Mono',monospace",cursor:"pointer"}}>
            {Object.keys(GENRES).map(g=><option key={g} value={g}>{g}</option>)}
          </select>
          {showGenreInput&&<input value={customGenre} onChange={e=>setCustomGenre(e.target.value)} placeholder="e.g. Shoegaze..." style={{background:"#1C1409",border:"1px solid #4A3820",color:"#F7F0E2",padding:"4px 8px",borderRadius:5,fontSize:11,width:120,outline:"none"}}/>}
        </div>

        <div style={{marginLeft:"auto",display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
          <select value={customTuning?"custom":tuningKey} onChange={e=>{if(e.target.value!=="custom"){setTuningKey(e.target.value);setCustomTuning(null);setSelectedFrets({});}}} style={{background:"#1C1409",border:"1px solid #4A3820",color:"#C9A468",padding:"4px 6px",borderRadius:5,fontSize:10,fontFamily:"'DM Mono',monospace",cursor:"pointer"}}>
            {Object.keys(TUNINGS).map(t=><option key={t} value={t}>{t}</option>)}
            {customTuning&&<option value="custom">Custom</option>}
          </select>
          <button className="btn" onClick={()=>setShowCustom(!showCustom)} style={{background:"#1C1409",border:"1px solid #4A3820",color:"#C9A468",padding:"4px 8px",borderRadius:5}}>Custom ▾</button>
          <div style={{width:1,height:16,background:"#241A0D"}}/>
          <button className="btn" onClick={saveProject} style={{background:"#E8C661",color:"#0B0804",padding:"4px 10px",borderRadius:5,fontWeight:700}}>Save</button>
          <button className="btn" onClick={()=>setShowProjects(!showProjects)} style={{background:"#1C1409",border:"1px solid #4A3820",color:"#C9A468",padding:"4px 8px",borderRadius:5}}>Projects</button>
          <button className="btn" onClick={exportProject} style={{background:"#1C1409",border:"1px solid #4A3820",color:"#C9A468",padding:"4px 8px",borderRadius:5}}>↓ Export</button>
          <label className="btn" style={{background:"#1C1409",border:"1px solid #4A3820",color:"#C9A468",padding:"4px 8px",borderRadius:5,cursor:"pointer"}}>↑ Import<input type="file" accept=".json" style={{display:"none"}} onChange={importProject}/></label>
        </div>
      </div>

      {/* CUSTOM TUNING */}
      {showCustom&&(
        <div style={{background:"#0D0905",borderBottom:"1px solid #241A0D",padding:"7px 16px",display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          <span className="label" style={{marginRight:4}}>Strings (6→1):</span>
          {customInputs.map((n,i)=><input key={i} value={n} maxLength={2} onChange={e=>{const v=[...customInputs];v[i]=e.target.value.toUpperCase();setCustomInputs(v);}} style={{width:32,background:"#0B0804",border:"1px solid #4A3820",color:"#F7F0E2",padding:"3px",borderRadius:4,fontSize:11,textAlign:"center",fontFamily:"'DM Mono',monospace",outline:"none"}}/>)}
          <button className="btn" onClick={()=>{setCustomTuning([...customInputs]);setShowCustom(false);setSelectedFrets({});}} style={{background:"#E8C661",color:"#0B0804",padding:"3px 10px",borderRadius:5,fontWeight:700}}>Apply</button>
        </div>
      )}

      {/* PROJECTS PANEL */}
      {showProjects&&(
        <div style={{background:"#0D0905",borderBottom:"1px solid #241A0D",padding:"12px 16px"}}>
          <div className="label" style={{marginBottom:8}}>Saved Projects</div>
          {Object.keys(projects).length===0?<div style={{fontSize:11,color:"#4A3820"}}>No saved projects.</div>:(
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {Object.keys(projects).map(name=>(
                <div key={name} style={{background:"#1C1409",border:"1px solid #4A3820",borderRadius:7,padding:"7px 10px",display:"flex",gap:8,alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:12,fontWeight:600}}>{name}</div>
                    <div className="label">{projects[name].progression?.length||0} chords · {new Date(projects[name].savedAt).toLocaleDateString()}</div>
                  </div>
                  <button className="btn" onClick={()=>loadProject(name)} style={{background:"#E8C661",color:"#0B0804",padding:"2px 8px",borderRadius:4,fontWeight:700}}>Load</button>
                  <button className="btn" onClick={()=>deleteProject(name)} style={{background:"transparent",border:"1px solid #4A3820",color:"#5A3020",padding:"2px 6px",borderRadius:4}}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* INPUT MODE BAR */}
      <div style={{background:"#090604",borderBottom:"1px solid #241A0D",padding:"7px 16px",display:"flex",gap:6,alignItems:"center"}}>
        <button className="btn" onClick={()=>setInputMode("fretboard")} style={{background:inputMode==="fretboard"?"#4A3820":"transparent",border:`1px solid ${inputMode==="fretboard"?"#8A6E40":"#241A0D"}`,color:inputMode==="fretboard"?"#E8C661":"#8A6E40",padding:"3px 10px",borderRadius:5,fontWeight:600}}>Fretboard</button>
        <button className="btn" onClick={()=>setInputMode("text")} style={{background:inputMode==="text"?"#4A3820":"transparent",border:`1px solid ${inputMode==="text"?"#8A6E40":"#241A0D"}`,color:inputMode==="text"?"#E8C661":"#8A6E40",padding:"3px 10px",borderRadius:5,fontWeight:600}}>Type chord</button>
        {inputMode==="text"&&<>
          <input value={textInput} onChange={e=>handleTextInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&textChord)addToProgression(textChord);}} placeholder="Am7, Gsus4, C#maj7…" autoFocus style={{background:"#1C1409",border:"1px solid #4A3820",color:"#F7F0E2",padding:"4px 10px",borderRadius:5,fontSize:12,outline:"none",width:200,fontFamily:"'DM Mono',monospace"}}/>
          {textChord&&<div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:15,fontWeight:700,fontFamily:"'DM Mono',monospace",color:qc(textChord.type.quality)}}>{textChord.root}{textChord.type.abbrev}</span><span style={{fontSize:10,color:"#A98A52"}}>{textChord.type.name}</span></div>}
          {textInput&&!textChord&&<span style={{fontSize:11,color:"#FF8A8A"}}>Unrecognised</span>}
        </>}
      </div>

      {/* FRETBOARD */}
      {inputMode==="fretboard"&&(
        <div style={{overflowX:"auto",padding:"14px 16px 6px",background:"#090604",borderBottom:"1px solid #241A0D"}}>
          <div style={{minWidth:660}}>
            <div style={{display:"flex",marginLeft:40,marginBottom:2}}>
              {Array.from({length:FRETS+1},(_,f)=><div key={f} style={{width:f===0?36:50,flexShrink:0,textAlign:"center",fontSize:8,color:INLAY.has(f)?"#E8C661":"#221508",fontFamily:"'DM Mono',monospace",fontWeight:INLAY.has(f)?600:400}}>{f===0?"nut":f}</div>)}
            </div>
            {tuning.map((on,si)=>si).reverse().map((si)=>{
              const on = tuning[si];
              return (
              <div key={si} style={{display:"flex",alignItems:"center",marginBottom:1}}>
                <div style={{width:40,textAlign:"right",paddingRight:7,fontSize:10,fontFamily:"'DM Mono',monospace",color:"#E8C661",fontWeight:500,flexShrink:0}}>{on}</div>
                {Array.from({length:FRETS+1},(_,fr)=>{
                  const note=addSemi(on,fr), k=`${si}-${fr}`, isSel=!!selectedFrets[k];
                  const thick=[3,2.5,2,1.5,1,0.8][si]||1;
                  const inlay=(INLAY.has(fr)&&si===2)||(DBL_INLAY.has(fr)&&(si===1||si===4));
                  return (
                    <div key={fr} className="fc" onClick={()=>setSelectedFrets(p=>({...p,[k]:!p[k]}))} style={{width:fr===0?36:50,height:30,flexShrink:0,position:"relative",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      {fr===0?<div style={{position:"absolute",right:0,top:0,bottom:0,width:4,background:"linear-gradient(180deg,#D8C49E,#F7F0E2,#D8C49E)",zIndex:1}}/>:<div style={{position:"absolute",left:0,top:0,bottom:0,width:2,background:"linear-gradient(180deg,#B89456,#E8C661,#B89456)",borderRadius:1,zIndex:1}}/>}
                      <div style={{position:"absolute",left:0,right:0,height:thick,background:"linear-gradient(90deg,#8A6E40,#6A4525,#8A6E40)",zIndex:0}}/>
                      {inlay&&!isSel&&<div style={{position:"absolute",width:6,height:6,borderRadius:"50%",background:"#181008",border:"1px solid #221508",zIndex:2,pointerEvents:"none"}}/>}
                      <div className="dn" style={{width:isSel?24:18,height:isSel?24:18,borderRadius:"50%",background:isSel?cc:"rgba(255,255,255,0.025)",border:isSel?`2px solid ${cc}`:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:3,position:"relative",transition:"all 0.1s",boxShadow:isSel?`0 0 8px ${cc}55`:"none"}}>
                        <span style={{fontSize:7,fontFamily:"'DM Mono',monospace",color:isSel?"#0B0804":"rgba(237,228,208,0.18)",fontWeight:isSel?700:400}}>{note}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );})}
          </div>
        </div>
      )}

      {/* NOTES BAR */}
      <div style={{padding:"7px 16px",display:"flex",alignItems:"center",gap:5,borderBottom:"1px solid #241A0D",minHeight:38,flexWrap:"wrap"}}>
        <span className="label" style={{marginRight:4}}>Notes</span>
        {[...new Set(workingNotes)].map(n=><div key={n} style={{background:"#1C1409",border:`1px solid ${cc}44`,color:cc,padding:"2px 8px",borderRadius:20,fontSize:11,fontFamily:"'DM Mono',monospace",fontWeight:500}}>{n}</div>)}
        {workingNotes.length===0&&<span style={{fontSize:11,color:"#7A6038",fontStyle:"italic"}}>{inputMode==="fretboard"?"Tap frets to build a chord":"Type a chord name"}</span>}
        <div style={{marginLeft:"auto",display:"flex",gap:5}}>
          {inputMode==="fretboard"&&<button className="btn" onClick={()=>setSelectedFrets({})} style={{background:"transparent",border:"1px solid #241A0D",color:"#8A6E40",padding:"2px 8px",borderRadius:4}}>Clear</button>}
          <button className="btn" onClick={()=>addToProgression(workingChord)} disabled={!workingChord} style={{background:workingChord?"#E8C661":"#1C1409",color:workingChord?"#0B0804":"#7A6038",padding:"2px 12px",borderRadius:4,fontWeight:700,transition:"all 0.15s"}}>Add →</button>
        </div>
      </div>

      {/* PROJECT KEY BANNER */}
      {projectAnalysis && (
        <div style={{padding:"10px 16px",background:"#0D0A05",borderBottom:"1px solid #241A0D",display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span className="label">Project key</span>
            <span style={{fontSize:18,fontWeight:700,fontFamily:"'DM Mono',monospace",color:"#5FE3D8"}}>{projectAnalysis.kc.key} {projectAnalysis.kc.mode}</span>
            {projectAnalysis.confident ? (
              <span style={{fontSize:9,color:"#4FE3AB",fontFamily:"'DM Mono',monospace",background:"#0C2018",padding:"2px 6px",borderRadius:3}}>🔒 LOCKED · {projectAnalysis.fitPct}% fit</span>
            ) : (
              <span style={{fontSize:9,color:"#E8C661",fontFamily:"'DM Mono',monospace",background:"#1A1308",padding:"2px 6px",borderRadius:3}}>ESTIMATING · add more chords</span>
            )}
          </div>
          {pinnedKC && (
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:10,color:"#BCA4FF",fontFamily:"'DM Mono',monospace"}}>📌 overridden → {pinnedKC.key} {pinnedKC.mode}</span>
              <button className="btn" onClick={()=>setPinnedKC(null)} style={{background:"#241A0D",border:"1px solid #4A3820",color:"#C9A468",padding:"2px 8px",borderRadius:4,fontSize:9}}>Reset to detected</button>
            </div>
          )}
          {/* Out-of-key flags */}
          {(() => {
            const outliers = projectAnalysis.chordFit
              .map((f,i)=>({...f,i}))
              .filter(f=>f.inKey===false);
            if (outliers.length===0) return null;
            return (
              <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:"auto"}}>
                <span style={{fontSize:9,color:"#FFB224",fontFamily:"'DM Mono',monospace"}}>⚠ Out of key:</span>
                {outliers.map(o=>{
                  const ch = progression[o.i].chord;
                  return <span key={o.i} style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:"#FFB224",background:"#1A1308",padding:"1px 6px",borderRadius:3}}>{ch.root}{ch.type.abbrev||""}</span>;
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* MAIN ANALYSIS GRID */}
      <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:0,minHeight:280}}>

        {/* LEFT: Chord ID + Key */}
        <div style={{padding:"14px 16px",borderRight:"1px solid #241A0D"}}>
          <div className="label" style={{marginBottom:8}}>Chord</div>
          {workingChord?(
            <div>
              <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:2}}>
                <span style={{fontSize:34,fontWeight:700,color:cc,fontFamily:"'DM Mono',monospace",lineHeight:1}}>{workingChord.root}</span>
                <span style={{fontSize:18,fontWeight:500,color:"#E8C661",fontFamily:"'DM Mono',monospace"}}>{workingChord.type.custom?(workingChord.type.abbrev==="*"?"?":workingChord.type.abbrev):(workingChord.type.abbrev||"maj")}</span>
              </div>
              <div style={{fontSize:11,color:"#A98A52",marginBottom:12}}>{workingChord.type.custom?"Unrecognised — saved as custom voicing":workingChord.type.name}</div>

              {workingChord.type.custom?(
                <div style={{color:"#A98A52",fontSize:11,lineHeight:1.6}}>
                  This note set doesn't match a standard chord shape, but you can still add it to your progression. Key analysis isn't available for custom voicings.
                </div>
              ):(<>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                <div className="label">Key / Mode <span style={{color:"#7A6038"}}>— tap to pin</span></div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:2,maxHeight:180,overflowY:"auto"}}>
                {keyContexts.map((kc,i)=>{
                  const pinned=pinnedKC&&pinnedKC.key===kc.key&&pinnedKC.mode===kc.mode;
                  const active=activeKC&&activeKC.key===kc.key&&activeKC.mode===kc.mode;
                  return(
                    <div key={i} className="pill" onClick={()=>setPinnedKC(pinned?null:kc)} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 6px",borderRadius:5,background:active?"#1C1409":"transparent",border:`1px solid ${active?"#4A3820":"transparent"}`}}>
                      <span style={{fontSize:12,fontFamily:"'DM Mono',monospace",color:"#F7F0E2",fontWeight:600,minWidth:20}}>{kc.key}</span>
                      <span style={{fontSize:8,color:"#5FE3D8",fontFamily:"'DM Mono',monospace",background:"#0C2018",padding:"1px 4px",borderRadius:3}}>{kc.degree}</span>
                      <span style={{fontSize:10,color:"#9A7C48"}}>{kc.mode}</span>
                      {pinned&&<span style={{fontSize:9,color:"#E8C661",marginLeft:"auto"}}>📌</span>}
                    </div>
                  );
                })}
              </div>
              </>)}
            </div>
          ):(
            <div style={{color:"#7A6038",fontSize:12,paddingTop:4}}>
              {workingNotes.length>0?"No standard chord detected":"Select or type a chord"}
            </div>
          )}
        </div>

        {/* RIGHT: Tabs */}
        <div style={{display:"flex",flexDirection:"column"}}>
          {/* Tab bar */}
          <div style={{display:"flex",borderBottom:"1px solid #241A0D",padding:"0 16px"}}>
            {[["next","Next Chords"],["diatonic","Diatonic"],["modulate","Key Change"],["style","Style DNA"]].map(([id,label])=>(
              <button key={id} className="btn" onClick={()=>setActiveTab(id)} style={{padding:"9px 14px",borderRadius:0,background:"transparent",color:activeTab===id?"#E8C661":"#8A6E40",fontWeight:activeTab===id?700:400,borderBottom:activeTab===id?"2px solid #E8C661":"2px solid transparent",fontSize:11}}>
                {label}
              </button>
            ))}
            {/* Genre AI button */}
            <button className="btn" onClick={handleAiGenre} style={{marginLeft:"auto",background:"#1C1409",border:"1px solid #4A3820",color:"#C9A468",padding:"5px 10px",borderRadius:5,fontSize:10,alignSelf:"center",display:"flex",alignItems:"center",gap:5}}>
              ✨ {genre} ideas
            </button>
          </div>

          {/* Tab content */}
          <div style={{padding:"14px 16px",flex:1}}>

            {/* NEXT CHORDS */}
            {activeTab==="next"&&(
              <div>
                <div className="label" style={{marginBottom:10}}>{activeKC?(projectKC&&progression.length>0&&!pinnedKC?`Based on your progression in ${activeKC.key} ${activeKC.mode}`:`From ${workingChord?.root||"?"}${workingChord?.type?.abbrev||""} in ${activeKC.key} ${activeKC.mode}`):"Add a chord to see suggestions"}</div>
                {nextChords.length>0?(
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                    {nextChords.map((s,i)=>{
                      const col=qc(s.type.quality);
                      return(
                        <div key={i} style={{background:"#171108",border:`1px solid ${col}30`,borderRadius:8,padding:"10px 8px",display:"flex",flexDirection:"column",gap:4}}>
                          <div className="pill" onClick={()=>addToProgression(s,activeKC)} style={{fontSize:18,fontWeight:700,fontFamily:"'DM Mono',monospace",color:col,lineHeight:1}}>{s.root}{s.type.abbrev||""}</div>
                          <div style={{fontSize:8,color:"#5FE3D8",fontFamily:"'DM Mono',monospace"}}>{s.degree}</div>
                          <button className="btn" onClick={()=>handleExplain(s,activeKC,`(${s.degree})`)} style={{background:"#241A0D",border:"1px solid #4A3820",color:"#A98A52",padding:"2px 0",borderRadius:3,marginTop:2,fontSize:9}}>✨ Explain</button>
                        </div>
                      );
                    })}
                  </div>
                ):<div style={{fontSize:12,color:"#7A6038"}}>Add a chord first</div>}
              </div>
            )}

            {/* DIATONIC */}
            {activeTab==="diatonic"&&(
              <div>
                <div className="label" style={{marginBottom:10}}>
                  {activeKC?`All chords in ${activeKC.key} ${activeKC.mode} · sorted by ${genre} affinity`:"Add a chord to see the scale"}
                </div>
                {biasedDiatonic.length>0?(
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                    {biasedDiatonic.map((dc,i)=>{
                      const col=qc(dc.type.quality);
                      const bias=genreData.bias[dc.type.quality]||0;
                      return(
                        <div key={i} style={{background:"#171108",border:`1px solid ${col}${bias>1?"55":"22"}`,borderRadius:8,padding:"9px 8px",display:"flex",flexDirection:"column",gap:3}}>
                          <div className="pill" onClick={()=>addToProgression(dc,activeKC)} style={{fontSize:17,fontWeight:700,fontFamily:"'DM Mono',monospace",color:col,lineHeight:1}}>{dc.root}{dc.type.abbrev}</div>
                          <div style={{fontSize:8,color:"#5FE3D8",fontFamily:"'DM Mono',monospace"}}>{dc.degree}</div>
                          {bias>1&&<div style={{fontSize:7,color:"#E8C661",fontFamily:"'DM Mono',monospace"}}>★ {genre}</div>}
                          <button className="btn" onClick={()=>handleExplain(dc,activeKC,`(${dc.degree})`)} style={{background:"#241A0D",border:"1px solid #4A3820",color:"#A98A52",padding:"2px 0",borderRadius:3,marginTop:2,fontSize:9}}>✨ Explain</button>
                        </div>
                      );
                    })}
                  </div>
                ):<div style={{fontSize:12,color:"#7A6038"}}>Add a chord first</div>}
              </div>
            )}

            {/* MODULATE */}
            {activeTab==="modulate"&&(
              <div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <div className="label">Key change pivots</div>
                  <button className="btn" onClick={()=>setRandSeed(s=>s+1)} style={{background:"#1C1409",border:"1px solid #4A3820",color:"#B89456",padding:"2px 8px",borderRadius:4,fontSize:9}}>↻ New random</button>
                </div>
                {modulations.length>0?(
                  <div style={{display:"flex",flexDirection:"column",gap:7}}>
                    {modulations.map((m,i)=>(
                      <div key={i} style={{background:"#171108",border:`1px solid ${m.color}22`,borderRadius:8,padding:"10px 12px",display:"flex",alignItems:"center",gap:12}}>
                        <div style={{flex:1}}>
                          <div style={{fontSize:8,color:m.color,fontFamily:"'DM Mono',monospace",letterSpacing:"0.08em",marginBottom:3}}>{m.label.toUpperCase()}</div>
                          <div style={{fontSize:15,fontWeight:700,color:"#F7F0E2",fontFamily:"'DM Mono',monospace"}}>{m.desc}</div>
                        </div>
                        <div style={{textAlign:"center"}}>
                          <div className="label" style={{marginBottom:3}}>via</div>
                          <div className="pill" onClick={()=>addToProgression({root:m.pivot,type:CHORD_TYPES.find(c=>c.abbrev===m.pivotAbbrev)||CHORD_TYPES[0]},activeKC)} style={{background:`${m.color}15`,border:`1px solid ${m.color}44`,borderRadius:6,padding:"5px 10px",fontSize:13,fontWeight:700,fontFamily:"'DM Mono',monospace",color:m.color}}>{m.pivot}{m.pivotAbbrev}</div>
                        </div>
                        <button className="btn" onClick={()=>handleExplain({root:m.pivot,type:CHORD_TYPES.find(c=>c.abbrev===m.pivotAbbrev)||CHORD_TYPES[0]},activeKC,`pivot to ${m.desc}`)} style={{background:"#1C1409",border:"1px solid #4A3820",color:"#A98A52",padding:"4px 8px",borderRadius:4,fontSize:9}}>✨ Explain</button>
                      </div>
                    ))}
                  </div>
                ):<div style={{fontSize:12,color:"#7A6038"}}>Add a chord first</div>}
              </div>
            )}

            {/* STYLE DNA */}
            {activeTab==="style"&&(
              <div>
                <div className="label" style={{marginBottom:10}}>Your writing style — based on {progression.length} chord{progression.length!==1?"s":""}</div>
                {styleProfile&&progression.length>=2?(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                    <div style={{background:"#171108",border:"1px solid #241A0D",borderRadius:8,padding:"10px 12px"}}>
                      <div className="label" style={{marginBottom:6}}>Tonality</div>
                      <div style={{fontSize:14,fontWeight:700,color:"#5FE3D8",fontFamily:"'DM Mono',monospace"}}>{styleProfile.tonality}</div>
                    </div>
                    <div style={{background:"#171108",border:"1px solid #241A0D",borderRadius:8,padding:"10px 12px"}}>
                      <div className="label" style={{marginBottom:6}}>Complexity</div>
                      <div style={{fontSize:14,fontWeight:700,color:"#E8C661",fontFamily:"'DM Mono',monospace"}}>{styleProfile.complexity}</div>
                    </div>
                    <div style={{background:"#171108",border:"1px solid #241A0D",borderRadius:8,padding:"10px 12px"}}>
                      <div className="label" style={{marginBottom:6}}>Mood fingerprint</div>
                      <div style={{fontSize:14,fontWeight:700,color:"#BCA4FF",fontFamily:"'DM Mono',monospace"}}>{styleProfile.mood}</div>
                    </div>
                    <div style={{background:"#171108",border:"1px solid #241A0D",borderRadius:8,padding:"10px 12px"}}>
                      <div className="label" style={{marginBottom:6}}>Chord bias</div>
                      {styleProfile.topQualities.map(([q,c])=>(
                        <div key={q} style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                          <div style={{width:Math.round(c/styleProfile.total*60),height:4,background:qc(q),borderRadius:2}}/>
                          <span style={{fontSize:9,fontFamily:"'DM Mono',monospace",color:qc(q)}}>{q} ×{c}</span>
                        </div>
                      ))}
                    </div>
                    {styleProfile.topPatterns.length>0&&(
                      <div style={{background:"#171108",border:"1px solid #241A0D",borderRadius:8,padding:"10px 12px",gridColumn:"1/-1"}}>
                        <div className="label" style={{marginBottom:6}}>Repeated patterns</div>
                        {styleProfile.topPatterns.map(([p,c])=>(
                          <div key={p} style={{fontSize:10,fontFamily:"'DM Mono',monospace",color:"#A98A52",marginBottom:3}}>{p} <span style={{color:"#E8C661"}}>×{c}</span></div>
                        ))}
                      </div>
                    )}
                  </div>
                ):(
                  <div style={{fontSize:12,color:"#7A6038"}}>Add at least 2 chords to build your style profile.</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PROGRESSION STRIP */}
      <div style={{borderTop:"1px solid #241A0D",padding:"12px 16px",background:"#090604"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div className="label">Progression {progression.length>0&&`(${progression.length} chords)`}</div>
          {progression.length>0&&<button className="btn" onClick={()=>setProgression([])} style={{background:"transparent",border:"none",color:"#4A3820",fontFamily:"'DM Mono',monospace",fontSize:9}}>CLEAR ALL</button>}
        </div>
        {progression.length===0?(
          <div style={{fontSize:11,color:"#7A6038",fontStyle:"italic"}}>Your progression appears here. Click any chord suggestion or "Add →" to build it.</div>
        ):(
          <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
            {progression.map((p,i)=>{
              const col=qc(p.chord.type.quality);
              return(
                <div key={i} style={{display:"flex",alignItems:"center",gap:3}}>
                  {i>0&&<div style={{color:"#241A0D",fontSize:12}}>→</div>}
                  <div style={{position:"relative"}}>
                    <div className="pill" onClick={()=>handleExplain(p.chord,p.keyContext,`(position ${i+1})`)} style={{background:"#171108",border:`1px solid ${col}44`,borderRadius:7,padding:"6px 10px",textAlign:"center",minWidth:46}}>
                      <div style={{fontSize:13,fontWeight:700,fontFamily:"'DM Mono',monospace",color:col,lineHeight:1}}>{p.chord.root}{p.chord.type.abbrev||""}</div>
                      {p.keyContext&&<div style={{fontSize:7,color:"#4A3820",fontFamily:"'DM Mono',monospace",marginTop:1}}>{p.keyContext.degree}/{p.keyContext.key}</div>}
                    </div>
                    <button className="btn" onClick={()=>setProgression(prev=>prev.filter((_,j)=>j!==i))} style={{position:"absolute",top:-5,right:-5,width:14,height:14,borderRadius:"50%",background:"#2A1008",border:"none",color:"#FF8A8A",fontSize:8,display:"flex",alignItems:"center",justifyContent:"center",padding:0,lineHeight:1}}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
