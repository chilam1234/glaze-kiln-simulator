// Glaze library. Colors are sRGB hex; interpolation happens in linear space.
// fired stops: [effectiveThickness, color, opacity, roughness]
// Mixing/look properties (all optional): family (picker group), transl (0..1 translucency as a top coat), float
//   (how readily it breaks into the colour below in cells/streaks), rutile (streaky rutile content), iron (iron content: pulls
//   gold/brown streaks out of rutile tops), breakCol (colour on sharp edges/thin), vari {type: rutile|mottle|float|fleck, col, amt, dens}
//   (or an array of them), src (the real AMACO product the colours were approximated from; shown in the UI),
//   metal (0..1 metallic surface).
// veilT: when a thin coat of this glaze lies over another, read its colour at least at this thickness (copper's
//        bare-thin stops are an unreduced grey-green that would outline drips; its veil should be translucent red)
export const GLAZES = [
  // ---- colours approximated from AMACO product photos + the Sheffield Pottery cone 6 chart (see ref/samples.json, not shipped) ----
  { id: 'celadon', family: 'blues', src: 'AMACO PC-40 True Celadon', transl: 0.6, iron: 0.25, float: 0.2, name: 'True Celadon PC-40', raw: '#bcc6c9',
    fired: [[0.04, '#a3a975', 0.45, 0.1], [0.2, '#97a16a', 0.72, 0.08], [0.45, '#7b8e54', 0.88, 0.06], [0.8, '#618642', 0.95, 0.05], [1.4, '#475e26', 1.0, 0.045]],
    breakCol: '#b2c289', fluidity: 0.35, crackle: 0.25, crackleFine: 1.0, crackTint: 0.85, speckle: 0.0, breakAmt: 0.9, poolAmt: 1.1, defaultThickness: 0.6 },
  { id: 'tenmoku', family: 'dark', src: 'AMACO PC-30 Temmoku', iron: 1.0, float: 0.35, name: 'Temmoku PC-30', raw: '#8b7f74',
    fired: [[0.04, '#523f28', 0.85, 0.42], [0.16, '#291d0e', 0.97, 0.36], [0.35, '#443315', 1.0, 0.33], [0.7, '#342b17', 1.0, 0.31], [1.3, '#252011', 1.0, 0.3]],
    breakCol: '#634e34', breakStr: 0.8, vari: [{ type: 'fleck', col: '#8f7f59', amt: 0.8, dens: 0.07 }, { type: 'mottle', col: '#1b1709', amt: 0.55 }],
    fluidity: 0.3, crackle: 0.0, crackleFine: 0.5, crackTint: 0, speckle: 0.2, breakAmt: 1.0, poolAmt: 0.7, defaultThickness: 0.6 },
  { id: 'shino', family: 'neutral', src: 'AMACO SH-11 Chai Gloss (Shino)', float: 0.55, iron: 0.3, name: 'Chai Gloss SH-11', raw: '#e5ddd1',
    fired: [[0.04, '#7d453b', 0.8, 0.16], [0.15, '#8d5749', 0.92, 0.14], [0.3, '#a58869', 0.98, 0.12], [0.6, '#af9c80', 1.0, 0.1], [1.2, '#b6a78a', 1.0, 0.1]],
    breakCol: '#783f34', vari: { type: 'mottle', col: '#9c7359', amt: 0.22 },
    fluidity: 0.12, crackle: 0.0, crackleFine: 0.8, crackTint: 0.3, speckle: 0.35, breakAmt: 1.0, poolAmt: 0.5, defaultThickness: 0.6 },
  { id: 'crackle', family: 'neutral', src: 'AMACO KI-11 Snow Drift (Kiln Ice)', transl: 0.5, float: 0.25, name: 'Snow Drift KI-11', raw: '#e8e5dd',
    fired: [[0.04, '#9b9fa8', 0.45, 0.1], [0.2, '#aeb3ba', 0.72, 0.08], [0.5, '#bbc0c7', 0.88, 0.07], [1.0, '#c8cdd3', 0.95, 0.06]],
    vari: { type: 'float', col: '#cfd5dc', amt: 0.55 },
    fluidity: 0.25, crackle: 0.7, crackleFine: 1.0, crackTint: 0.95, speckle: 0.0, breakAmt: 0.8, poolAmt: 0.7, defaultThickness: 0.6 },
  { id: 'matte', family: 'neutral', src: 'AMACO SM-11 White (Satin Matte)', float: 0.45, name: 'Satin Matte White SM-11', raw: '#f0eee9',
    fired: [[0.04, '#b0aba1', 0.7, 0.6], [0.2, '#b9b4aa', 0.92, 0.58], [0.5, '#bebab0', 1.0, 0.56], [1.2, '#c2bdb6', 1.0, 0.55]],
    fluidity: 0.03, crackle: 0.0, crackleFine: 0.5, crackTint: 0, speckle: 0.05, breakAmt: 0.7, poolAmt: 0.4, defaultThickness: 0.6 },
  { id: 'cobalt', family: 'blues', src: 'AMACO C-20 Cobalt (Celadon)', transl: 0.35, float: 0.3, name: 'Cobalt C-20', raw: '#a4a3b6',
    fired: [[0.04, '#344584', 0.55, 0.1], [0.2, '#263476', 0.82, 0.07], [0.45, '#1f256a', 0.93, 0.05], [0.8, '#19184f', 0.98, 0.045], [1.4, '#0f0d2e', 1.0, 0.04]],
    breakCol: '#415498', fluidity: 0.45, crackle: 0.0, crackleFine: 1.0, crackTint: 0.5, speckle: 0.0, breakAmt: 0.9, poolAmt: 1.1, defaultThickness: 0.6 },
  { id: 'copper', family: 'warm', src: 'AMACO PC-70 Copper Red', transl: 0.3, float: 0.3, name: 'Copper Red PC-70', raw: '#a8b19f',
    fired: [[0.04, '#aa9a92', 0.2, 0.12], [0.2, '#9c7a75', 0.4, 0.1], [0.32, '#825a5f', 0.8, 0.08], [0.5, '#74414a', 0.95, 0.06], [0.9, '#6d3741', 1.0, 0.05], [1.6, '#5d2a35', 1.0, 0.04]],
    breakCol: '#b49d94', veilT: 0.42, fluidity: 0.5, crackle: 0.05, crackleFine: 1.0, crackTint: 0.6, speckle: 0.0, breakAmt: 1.0, poolAmt: 1.0, defaultThickness: 0.6 },
  { id: 'ash', family: 'blues', like: 'generic wood-ash glaze (no AMACO equivalent)', transl: 0.4, rutile: 0.25, float: 0.3, iron: 0.3, name: 'Ash', raw: '#9d9484',
    fired: [[0.04, '#8c6c3c', 0.55, 0.55], [0.2, '#86733a', 0.8, 0.35], [0.45, '#6e6f3a', 0.9, 0.15], [0.8, '#56693f', 0.94, 0.06], [1.4, '#3a5745', 0.97, 0.04]],
    fluidity: 1.0, crackle: 0.12, crackleFine: 1.0, crackTint: 0.6, speckle: 0.25, breakAmt: 0.9, poolAmt: 1.0, defaultThickness: 0.6 },
  { id: 'rutile', family: 'blues', src: 'AMACO PC-20 Blue Rutile', name: 'Blue Rutile PC-20', raw: '#a3a6a9',   // speckled grey-blue, brown with tan specks where thin
    fired: [[0.04, '#3c2e16', 0.85, 0.2], [0.14, '#30230c', 0.95, 0.16], [0.3, '#445356', 1.0, 0.12], [0.55, '#415c69', 1.0, 0.1], [0.9, '#374e57', 1.0, 0.09], [1.5, '#1b2d36', 1.0, 0.08]],
    breakCol: '#3c2e16', breakStr: 0.95, vari: [{ type: 'mottle', col: '#577474', amt: 0.3 }, { type: 'fleck', col: '#4a4131', amt: 0.5, dens: 0.12 }, { type: 'rutile', col: '#473d27', amt: 0.3 }],
    rutile: 1.0, float: 0.75, fluidity: 0.65, crackle: 0.15, crackleFine: 1.0, crackTint: 0.4, speckle: 0.05, breakAmt: 1.0, poolAmt: 1.0, defaultThickness: 0.7 },
  { id: 'turquoise', family: 'blues', src: 'AMACO HF-125 Turquoise', name: 'Turquoise HF-125', raw: '#aab6b4',
    fired: [[0.04, '#a0c3bc', 0.75, 0.1], [0.2, '#8bb7ad', 0.95, 0.07], [0.6, '#7da9a0', 1.0, 0.06], [1.2, '#709e95', 1.0, 0.05]],
    breakCol: '#adcbc4', float: 0.4, fluidity: 0.15, crackle: 0.0, crackleFine: 1.0, crackTint: 0.2, speckle: 0.0, breakAmt: 0.9, poolAmt: 0.8, defaultThickness: 0.6 },
  { id: 'seaweed', family: 'blues', src: 'AMACO PC-42 Seaweed', name: 'Seaweed PC-42', raw: '#a4a08f',   // deep green, breaks brown
    fired: [[0.04, '#3b3720', 0.9, 0.16], [0.15, '#2e2b1b', 0.97, 0.12], [0.3, '#304828', 1.0, 0.09], [0.55, '#294c2a', 1.0, 0.07], [0.9, '#254926', 1.0, 0.06], [1.5, '#153a25', 1.0, 0.05]],
    breakCol: '#393620', breakStr: 0.9, vari: [{ type: 'mottle', col: '#153a25', amt: 0.4 }, { type: 'rutile', col: '#55482a', amt: 0.45 }, { type: 'float', col: '#2c5a4e', amt: 0.35 }], rutile: 0.4, float: 0.6,
    fluidity: 0.75, crackle: 0.0, crackleFine: 1.0, crackTint: 0.3, speckle: 0.0, breakAmt: 1.0, poolAmt: 1.0, defaultThickness: 0.7 },
  { id: 'chartreuse', family: 'blues', src: 'AMACO HF-142 Chartreuse', name: 'Chartreuse HF-142', raw: '#d6d9bb',
    fired: [[0.04, '#9fb74f', 0.75, 0.1], [0.2, '#92ae3c', 0.95, 0.07], [0.6, '#84a539', 1.0, 0.06], [1.2, '#799b38', 1.0, 0.05]],
    breakCol: '#a7be60', fluidity: 0.12, crackle: 0.0, crackleFine: 1.0, crackTint: 0.2, speckle: 0.0, breakAmt: 0.9, poolAmt: 0.9, defaultThickness: 0.6 },
  { id: 'yellow', family: 'warm', src: 'AMACO HF-161 Bright Yellow', name: 'Bright Yellow HF-161', raw: '#e9e3c6',
    fired: [[0.04, '#f5f2a1', 0.75, 0.1], [0.2, '#f8f385', 0.95, 0.07], [0.6, '#f8f172', 1.0, 0.06], [1.2, '#f4ec61', 1.0, 0.05]],
    breakCol: '#f7f6b4', float: 0.35, fluidity: 0.1, crackle: 0.0, crackleFine: 1.0, crackTint: 0.2, speckle: 0.0, breakAmt: 0.8, poolAmt: 0.8, defaultThickness: 0.6 },
  { id: 'orange', family: 'warm', src: 'AMACO HF-167 Clementine', name: 'Clementine HF-167', raw: '#e4d3be',
    fired: [[0.04, '#e46c37', 0.75, 0.1], [0.2, '#e25620', 0.95, 0.07], [0.6, '#de4d1c', 1.0, 0.06], [1.2, '#d1481c', 1.0, 0.05]],
    breakCol: '#e88149', float: 0.35, fluidity: 0.12, crackle: 0.0, crackleFine: 1.0, crackTint: 0.3, speckle: 0.0, breakAmt: 0.9, poolAmt: 0.9, defaultThickness: 0.6 },
  { id: 'amber', family: 'warm', src: 'AMACO PC-68 Golden Honey', name: 'Golden Honey PC-68', raw: '#b9ad97',   // translucent whipped-honey yellow, richer where thick
    fired: [[0.04, '#fbd79e', 0.45, 0.16], [0.25, '#fccf90', 0.7, 0.15], [0.6, '#f9c17c', 0.86, 0.14], [1.1, '#f0af67', 0.93, 0.13], [1.8, '#dd984d', 0.97, 0.12]],
    breakCol: '#ffe0b0', transl: 0.6, iron: 0.4, float: 0.15, fluidity: 0.5, crackle: 0.1, crackleFine: 1.0, crackTint: 0.7, speckle: 0.0, breakAmt: 1.0, poolAmt: 1.2, defaultThickness: 0.6 },
  { id: 'ironred', family: 'warm', src: 'AMACO PC-59 Deep Firebrick', name: 'Deep Firebrick PC-59', raw: '#b19d8b',   // speckled brick red, translucent where thin
    fired: [[0.04, '#822d20', 0.75, 0.1], [0.15, '#731310', 0.92, 0.08], [0.4, '#5c0f0f', 1.0, 0.07], [0.8, '#4f0c0d', 1.0, 0.06], [1.4, '#420e0d', 1.0, 0.06]],
    breakCol: '#8d3828', vari: [{ type: 'fleck', col: '#1b0605', amt: 0.8, dens: 0.1 }, { type: 'mottle', col: '#64120f', amt: 0.3 }], iron: 1.0, float: 0.4,
    fluidity: 0.3, crackle: 0.0, crackleFine: 1.0, crackTint: 0.3, speckle: 0.3, breakAmt: 1.0, poolAmt: 0.8, defaultThickness: 0.7 },
  { id: 'rose', family: 'warm', src: 'AMACO C-50 Cherry Blossom (Celadon)', transl: 0.45, name: 'Cherry Blossom C-50', raw: '#e5d7d7',
    fired: [[0.04, '#f4cebc', 0.55, 0.1], [0.2, '#f2b9a7', 0.8, 0.07], [0.5, '#ecaa98', 0.92, 0.06], [0.9, '#db8b7e', 0.97, 0.05], [1.5, '#b96a59', 1.0, 0.045]],
    breakCol: '#f8ddcd', float: 0.35, fluidity: 0.35, crackle: 0.0, crackleFine: 1.0, crackTint: 0.2, speckle: 0.0, breakAmt: 0.9, poolAmt: 1.1, defaultThickness: 0.6 },
  { id: 'plum', family: 'warm', src: 'AMACO C-57 Mulberry (Celadon)', transl: 0.4, name: 'Mulberry C-57', raw: '#b8aeb4',
    fired: [[0.04, '#9e6b83', 0.55, 0.1], [0.2, '#905a72', 0.8, 0.07], [0.5, '#78495e', 0.92, 0.06], [0.9, '#683f51', 0.97, 0.05], [1.5, '#3c3040', 1.0, 0.045]],
    breakCol: '#ad8098', float: 0.35, fluidity: 0.4, crackle: 0.0, crackleFine: 1.0, crackTint: 0.3, speckle: 0.0, breakAmt: 0.9, poolAmt: 1.1, defaultThickness: 0.6 },
  { id: 'oatmeal', family: 'neutral', src: 'AMACO PC-31 Oatmeal', transl: 0.35, name: 'Oatmeal PC-31', raw: '#dad2c3',   // toasty light beige, fairly translucent, breaks clear
    fired: [[0.04, '#b5a361', 0.6, 0.22], [0.2, '#beaa63', 0.8, 0.2], [0.5, '#d3bd6b', 0.9, 0.18], [0.9, '#dec77a', 0.95, 0.17], [1.4, '#e8cf80', 1.0, 0.16]],
    breakCol: '#c4b683', vari: { type: 'fleck', col: '#8c7c4b', amt: 0.6, dens: 0.06 }, float: 0.5,
    fluidity: 0.2, crackle: 0.0, crackleFine: 0.5, crackTint: 0, speckle: 0.35, breakAmt: 0.9, poolAmt: 0.6, defaultThickness: 0.6 },
  { id: 'blackmatte', family: 'dark', src: 'AMACO SM-1 Black (Satin Matte)', name: 'Satin Matte Black SM-1', raw: '#706c69',
    fired: [[0.04, '#5e5d5b', 0.85, 0.58], [0.2, '#464748', 0.97, 0.56], [0.6, '#393b3c', 1.0, 0.55], [1.2, '#313233', 1.0, 0.54]],
    breakCol: '#757575', iron: 0.7, float: 0.5, fluidity: 0.05, crackle: 0.0, crackleFine: 0.5, crackTint: 0, speckle: 0.05, breakAmt: 0.8, poolAmt: 0.4, defaultThickness: 0.6 },
  { id: 'bronze', family: 'dark', src: 'AMACO PC-2 Saturation Gold', name: 'Saturation Gold PC-2', raw: '#615c57',   // satin dark gold, like bronze; olive where thin
    fired: [[0.04, '#868259', 0.9, 0.42], [0.2, '#8e7b46', 1.0, 0.4], [0.5, '#997b3f', 1.0, 0.37], [1.0, '#a68a56', 1.0, 0.35], [1.6, '#a78b57', 1.0, 0.35]],
    breakCol: '#605337', vari: { type: 'mottle', col: '#c2a363', amt: 0.35 }, metal: 0.7, iron: 0.8, float: 0.45,
    fluidity: 0.1, crackle: 0.0, crackleFine: 0.5, crackTint: 0, speckle: 0.05, breakAmt: 1.0, poolAmt: 0.6, defaultThickness: 0.6 },
  // ---- more Potter's Choice, colours approximated from AMACO's published fired descriptions ----
  { id: 'indigo', family: 'blues', src: 'AMACO PC-23 Indigo Float', name: 'Indigo Float PC-23', raw: '#9aa3b8',
    fired: [[0.04, '#1a2c78', 0.82, 0.1], [0.18, '#1e3594', 0.94, 0.07], [0.4, '#2748b0', 1.0, 0.06], [0.8, '#3a62c4', 1.0, 0.05], [1.4, '#4d74d0', 1.0, 0.045]],
    breakCol: '#15245f', vari: { type: 'float', col: '#8aafeb', amt: 0.55 }, float: 0.7,
    fluidity: 0.4, crackle: 0.0, crackleFine: 1.0, crackTint: 0.2, speckle: 0.0, breakAmt: 1.0, poolAmt: 1.0, defaultThickness: 0.7 },
  { id: 'tourmaline', family: 'blues', src: 'AMACO PC-27 Tourmaline', name: 'Tourmaline PC-27', raw: '#8fafa8',
    fired: [[0.04, '#1f7e86', 0.88, 0.1], [0.2, '#187078', 0.97, 0.07], [0.55, '#146870', 1.0, 0.06], [1.2, '#105860', 1.0, 0.05]],
    breakCol: '#2a9498', float: 0.15,
    fluidity: 0.1, crackle: 0.0, crackleFine: 1.0, crackTint: 0.15, speckle: 0.0, breakAmt: 0.7, poolAmt: 0.6, defaultThickness: 0.6 },
  { id: 'albany', family: 'warm', src: 'AMACO PC-32 Albany Slip Brown', transl: 0.35, iron: 0.7, name: 'Albany Slip Brown PC-32', raw: '#b7a48a',
    fired: [[0.04, '#8a4524', 0.72, 0.14], [0.18, '#a35a2c', 0.86, 0.12], [0.4, '#c4843e', 0.94, 0.1], [0.8, '#d4a85a', 0.98, 0.09], [1.4, '#e2c07a', 1.0, 0.08]],
    breakCol: '#7a3a1c', float: 0.25,
    fluidity: 0.75, crackle: 0.0, crackleFine: 1.0, crackTint: 0.3, speckle: 0.05, breakAmt: 1.0, poolAmt: 1.15, defaultThickness: 0.6 },
  { id: 'lustre', family: 'dark', src: 'AMACO PC-33 Iron Lustre', iron: 0.85, name: 'Iron Lustre PC-33', raw: '#8d8478',
    fired: [[0.04, '#6b4530', 0.88, 0.22], [0.18, '#5c4638', 0.96, 0.18], [0.4, '#5a5e68', 1.0, 0.14], [0.85, '#6a7584', 1.0, 0.12], [1.4, '#7d8b9a', 1.0, 0.1]],
    breakCol: '#6b4530', vari: { type: 'float', col: '#9aafc4', amt: 0.5 }, float: 0.7, metal: 0.25,
    fluidity: 0.4, crackle: 0.0, crackleFine: 1.0, crackTint: 0.2, speckle: 0.05, breakAmt: 1.0, poolAmt: 0.9, defaultThickness: 0.7 },
  { id: 'jasper', family: 'warm', src: 'AMACO PC-53 Ancient Jasper', iron: 1.0, name: 'Ancient Jasper PC-53', raw: '#8a8474',
    fired: [[0.04, '#2c2c28', 0.92, 0.16], [0.16, '#3a4030', 0.97, 0.12], [0.35, '#5c6a32', 1.0, 0.1], [0.6, '#7a6230', 1.0, 0.08], [1.0, '#a34828', 1.0, 0.07], [1.6, '#8a301c', 1.0, 0.06]],
    breakCol: '#2c2c28', vari: [{ type: 'mottle', col: '#6a7838', amt: 0.4 }, { type: 'float', col: '#c45a32', amt: 0.35 }], float: 0.55,
    fluidity: 0.85, crackle: 0.0, crackleFine: 1.0, crackTint: 0.25, speckle: 0.05, breakAmt: 1.0, poolAmt: 1.15, defaultThickness: 0.7 },
  { id: 'chun', family: 'warm', src: 'AMACO PC-55 Chun Plum', transl: 0.55, name: 'Chun Plum PC-55', raw: '#cbb8b4',
    fired: [[0.04, '#e4d2bc', 0.4, 0.12], [0.2, '#e0b0a8', 0.62, 0.1], [0.45, '#d4898c', 0.82, 0.08], [0.85, '#c86a72', 0.94, 0.06], [1.5, '#b85a62', 1.0, 0.05]],
    breakCol: '#ead8c4', float: 0.3,
    fluidity: 0.4, crackle: 0.05, crackleFine: 1.0, crackTint: 0.45, speckle: 0.0, breakAmt: 1.0, poolAmt: 1.05, defaultThickness: 0.6 },
  { id: 'sienna', family: 'warm', src: 'AMACO PC-52 Deep Sienna Speckle', transl: 0.4, iron: 0.75, name: 'Deep Sienna Speckle PC-52', raw: '#b89a84',
    fired: [[0.04, '#c48a62', 0.62, 0.16], [0.2, '#b06a42', 0.82, 0.12], [0.5, '#9a4e30', 0.94, 0.1], [0.9, '#8a3e28', 1.0, 0.08], [1.5, '#6e2e1c', 1.0, 0.07]],
    breakCol: '#d4a078', vari: { type: 'fleck', col: '#1a100c', amt: 0.9, dens: 0.14 }, float: 0.3,
    fluidity: 0.35, crackle: 0.0, crackleFine: 1.0, crackTint: 0.2, speckle: 0.45, breakAmt: 0.9, poolAmt: 0.9, defaultThickness: 0.7 },
  { id: 'palladium', family: 'dark', src: 'AMACO PC-4 Palladium', name: 'Palladium PC-4', raw: '#b4b2ae',
    fired: [[0.04, '#8a8682', 0.7, 0.28], [0.22, '#a8aaae', 0.9, 0.16], [0.55, '#c5c8cc', 1.0, 0.08], [1.2, '#d4d8dc', 1.0, 0.05]],
    breakCol: '#9a9692', metal: 0.92, float: 0.2,
    fluidity: 0.55, crackle: 0.0, crackleFine: 0.5, crackTint: 0, speckle: 0.0, breakAmt: 0.6, poolAmt: 0.85, defaultThickness: 0.9 },
];
// display groups for the picker
export const FAMILIES = [['neutral', 'Whites & neutrals'], ['blues', 'Blues & greens'], ['warm', 'Warm & bright'], ['dark', 'Dark & metallic']];

// Pair interactions: key 'top|under'. color = overlap color, halo = boundary line color, cover = how much a thick top coat hides the overlap colour
export const PAIRS = {
  'tenmoku|shino': { color: '#9e3f17', halo: '#d99a4e', strength: 0.85 },
  'shino|tenmoku': { color: '#b0602f', halo: '#e3c69d', strength: 0.7 },
  'copper|tenmoku': { color: '#4a0f14', halo: '#5e2016', strength: 0.4, cover: 0.9 },
  'tenmoku|copper': { color: '#2d0d0c', halo: '#6d2a1c', strength: 0.6 },
  'copper|shino': { color: '#b8574f', halo: '#e2cdb5', strength: 0.6, cover: 0.6 },
  'shino|copper': { color: '#c98a73', halo: '#e8d6c0', strength: 0.55 },
  'celadon|tenmoku': { color: '#4c4424', halo: '#8a8a5a', strength: 0.6 },
  'tenmoku|celadon': { color: '#3a2716', halo: '#9b6a3a', strength: 0.6 },
  'ash|tenmoku': { color: '#5a4e23', halo: '#a58a45', strength: 0.6 },
  'ash|cobalt': { color: '#2d6468', halo: '#7fa6a2', strength: 0.55 },
  'ash|matte': { color: '#8e9660', halo: '#c9c7a4', strength: 0.5 },
  'ash|shino': { color: '#8c7a3e', halo: '#d8c49a', strength: 0.5 },
  'cobalt|shino': { color: '#4f5f95', halo: '#b9b7c6', strength: 0.5 },
  'matte|tenmoku': { color: '#8f7866', halo: '#d8c3a8', strength: 0.6 },
  'tenmoku|matte': { color: '#6a3a20', halo: '#c9a27a', strength: 0.5 },
};
export function pairFor(top, under) {
  return PAIRS[top + '|' + under] || null;
}

// Cone 10 palettes: Lab shift of Sheffield cone 6 cup → cone 10 tile, applied to our cone 6 app colours
// (cups vs tiles have different lighting, so these are relative shifts, not the raw photo hexes).
// src: 'ref' = Sheffield cone 10 sample exists; omitted entries are estimated (physics + mild iron browning only).
export const CONE10 = {
  celadon: { src: 'ref', fired: ['#d0be80', '#beb374', '#91965b', '#617a43', '#334222'], breakCol: '#e1d895' },
  tenmoku: { src: 'ref', fired: ['#493c32', '#211b18', '#413422', '#352d21', '#2b2015'], breakCol: '#5a4b3e',
    vari: [{ type: 'fleck', col: '#847c64', amt: 0.8, dens: 0.07 }, { type: 'mottle', col: '#20170f', amt: 0.55 }] },
  shino: { src: 'ref', fired: ['#8a3f38', '#9a5348', '#b07d68', '#c49a82', '#d4b090'], breakCol: '#7a3830',
    vari: { type: 'mottle', col: '#a06850', amt: 0.32 } },
  rutile: { src: 'ref', fired: ['#4a3814', '#3a2c10', '#4f4b3b', '#484c49', '#403f39', '#251f1b'], breakCol: '#4a3814',
    vari: [{ type: 'mottle', col: '#71765d', amt: 0.42 }, { type: 'fleck', col: '#4a3a22', amt: 0.55, dens: 0.12 }, { type: 'rutile', col: '#5a4a28', amt: 0.48 }] },
  seaweed: { src: 'ref', fired: ['#7a6b4a', '#6a5a3c', '#746040', '#5f542d', '#49491d', '#2e3415'], breakCol: '#8a7d5c',
    vari: [{ type: 'mottle', col: '#2e3415', amt: 0.55 }, { type: 'rutile', col: '#6a5a38', amt: 0.6 }, { type: 'float', col: '#5a5840', amt: 0.3 }] },
  ironred: { src: 'ref', fired: ['#875f50', '#7a4a3d', '#603d33', '#4e2c24', '#3c2118'], breakCol: '#916a59',
    vari: [{ type: 'fleck', col: '#2a1814', amt: 0.75, dens: 0.1 }, { type: 'mottle', col: '#683f32', amt: 0.35 }] },
  oatmeal: { src: 'ref', fired: ['#6c654b', '#6e6648', '#6a633d', '#5c5738', '#4a4326'], breakCol: '#78776a',
    vari: [{ type: 'fleck', col: '#3d3820', amt: 0.85, dens: 0.1 }, { type: 'mottle', col: '#4a4530', amt: 0.5 }] },
  bronze: { src: 'ref', fired: ['#8a8474', '#80786a', '#867b59', '#7a7464', '#6e6860'], breakCol: '#5a564c',
    vari: { type: 'mottle', col: '#a8a090', amt: 0.4 } },
  // iron-bearing glazes with no cone 10 photo: mild warmer/darker only
  ash: { src: 'est', fired: ['#8c6836', '#866f34', '#6e6c34', '#576639', '#3c543f'] },
  amber: { src: 'est', fired: ['#fcd295', '#fcca87', '#f9bc73', '#f0aa5e', '#dc9344'], breakCol: '#ffdba7' },
  blackmatte: { src: 'est', fired: ['#61554d', '#493f3b', '#3c342f', '#342b27'], breakCol: '#786d67' },
  indigo: { src: 'est', fired: ['#24367a', '#2a3f96', '#3452b0', '#4a68c0', '#5a78c8'], breakCol: '#1a2858' },
  tourmaline: { src: 'est', fired: ['#2a7a72', '#226e70', '#1c6268', '#185860'], breakCol: '#348880' },
  albany: { src: 'est', fired: ['#7a3c1c', '#8a4a24', '#a86a30', '#c09048', '#d4ae62'], breakCol: '#6a3014' },
  lustre: { src: 'est', fired: ['#5c3c28', '#4e4034', '#4e545e', '#5c6876', '#6e7c8a'], breakCol: '#5c3c28' },
  jasper: { src: 'est', fired: ['#242420', '#323628', '#4e5c2c', '#6a5428', '#8e3c22', '#7a2818'], breakCol: '#242420' },
  chun: { src: 'est', fired: ['#e0c8b0', '#d8a498', '#c8787c', '#bc6068', '#a85058'], breakCol: '#e4d0bc' },
  sienna: { src: 'est', fired: ['#b07850', '#9a5834', '#844028', '#743220', '#5c2414'], breakCol: '#c49468' },
  palladium: { src: 'est', fired: ['#7e7a76', '#9a9c9e', '#b4b8bc', '#c4c8cc'], breakCol: '#8e8a86' },
};
export function cone10Note(id) {
  return CONE10[id]?.src === 'ref' ? 'cone 10: Sheffield PC chart' : 'cone 10: estimated';
}
