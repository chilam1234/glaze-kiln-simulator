// Texture size shared by the pot, the painter, and the kiln thread. Kept out of pot.js so the
// firing worker does not have to load three.js.
export const TEX_W = 1024;   // around the pot (u)
export const TEX_H = 1024;   // along the profile, foot -> outer wall -> rim -> inner wall -> centre (v)
