import { CHARACTERS } from '../../shared/characters.ts';
import { type CompletionMarks, MARK_IDS, type MarkId, markLevel } from '../../shared/marks.ts';

/**
 * Index des marques dans le bloc des compteurs (bloc 2), par marque puis dans l'ordre de CHARACTERS.
 * Source : énumération EventCounter de REPENTOGON (valeurs PROGRESSION_*), recoupée avec les éditeurs
 * de sauvegarde communautaires et avec la sauvegarde de Player (2026-09-17).
 */
export const MARK_COUNTERS: Record<MarkId, readonly number[]> = {
  momsHeart: [27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 203, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232],
  isaac: [41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 204, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251],
  satan: [55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 205, 252, 253, 254, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270],
  bossRush: [69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 206, 271, 272, 273, 274, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 286, 287, 288, 289],
  blueBaby: [83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 207, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300, 301, 302, 303, 304, 305, 306, 307, 308],
  lamb: [97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 208, 309, 310, 311, 312, 313, 314, 315, 316, 317, 318, 319, 320, 321, 322, 323, 324, 325, 326, 327],
  megaSatan: [116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 209, 328, 329, 330, 331, 332, 333, 334, 335, 336, 337, 338, 339, 340, 341, 342, 343, 344, 345, 346],
  greed: [130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 210, 347, 348, 349, 350, 351, 352, 353, 354, 355, 356, 357, 358, 359, 360, 361, 362, 363, 364, 365],
  hush: [144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 211, 366, 367, 368, 369, 370, 371, 372, 373, 374, 375, 376, 377, 378, 379, 380, 381, 382, 383, 384],
  delirium: [173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 213, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418, 419, 420, 421, 422],
  mother: [423, 424, 425, 426, 427, 428, 429, 430, 431, 432, 433, 434, 435, 436, 437, 438, 439, 440, 441, 442, 443, 444, 445, 446, 447, 448, 449, 450, 451, 452, 453, 454, 455, 456],
  beast: [457, 458, 459, 460, 461, 462, 463, 464, 465, 466, 467, 468, 469, 470, 471, 472, 473, 474, 475, 476, 477, 478, 479, 480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 490],
};

const LAST_INDEX = 490;

/** Marques de complétion lues dans les compteurs, null si le bloc est trop court pour les contenir. */
export function readCompletionMarks(counters: readonly number[]): CompletionMarks | null {
  if (counters.length <= LAST_INDEX) return null;
  const marks = {} as CompletionMarks;
  CHARACTERS.forEach((character, position) => {
    marks[character.id] = Object.fromEntries(
      MARK_IDS.map((mark) => [mark, markLevel(counters[MARK_COUNTERS[mark][position]])]),
    ) as CompletionMarks[typeof character.id];
  });
  return marks;
}
