"""Reference config: which real AMACO glaze each simulator glaze is matched to, and where to sample it.
REFERENCE ONLY - the photos live in ref/ (git-ignored) and are never bundled into the app or dist.
Sources: shop.amaco.com product photos, and the Sheffield Pottery AMACO PC chart (cone 6 + cone 10 tiles)."""
AM = 'https://shop.amaco.com/'
SHEF_URL = 'https://www.sheffield-pottery.com/pages/amaco-pc-glaze-chart-for-cone-6-and-cone-10'
# Sheffield cone 6 chart: 5-col grid (x0 of each col), cup boxes ~97px
C6X = [15, 135, 258, 378, 498]; C6Y_TOP = [105, 246, 390, 534, 678]; C6Y_BOT = [870, 1014, 1155]
def c6(row, col, bottom=False):
    x, y = C6X[col], (C6Y_BOT if bottom else C6Y_TOP)[row]; return [x, y, x + 97, y + 97]
C10 = {  # Sheffield cone 10 chart boxes (detected by tools/sheffield_tiles.py; PC-2 estimated from the grid)
    'PC-20': [261, 81, 351, 180], 'PC-30': [300, 261, 387, 357], 'PC-31': [423, 261, 510, 357], 'PC-59': [537, 588, 627, 684],
    'PC-40': [54, 1197, 141, 1293], 'PC-42': [297, 1197, 387, 1293], 'PC-2': [297, 1002, 387, 1095], 'PC-50': [669, 450, 756, 546],
    'PC-61': [48, 768, 135, 864]}
APP = {'t1': [70, 140, 290, 490], 't2': [350, 140, 580, 490], 't3': [640, 140, 860, 380], 'cup': [700, 440, 980, 700]}   # AMACO application-tile photos (1024x768)
I = 'ref/img/'
MATCH = {
 'celadon':   dict(code='PC-40', name='True Celadon', url=AM + 'pc-40-true-celadon/', c6=c6(1, 1, True), c10=C10['PC-40'],
                   app=I + 'pc-40-true-celadon__large_pc40-application-tiles-and-sake-cup-2048px__53593.1659465592.jpg',
                   photo=I + 'pc-40-true-celadon__PC-40_6x6_Label_Tile_Chip-hires__79878.1659465592.jpg'),
 'tenmoku':   dict(code='PC-30', name='Temmoku', url=AM + 'pc-30-temmoku/', c6=c6(1, 2), c10=C10['PC-30'],
                   app=I + 'pc-30-temmoku__large_pc30-application-tiles-and-sake-cup-2048px__24151.1659532041.jpg',
                   photo=I + 'pc-30-temmoku__PC-30_6x6_Label_Tile_Chip-hires__04587.1659532041.jpg'),
 'shino':     dict(code='SH-11', name='Chai Gloss', url=AM + 'sh-11-chai-gloss/', c6_rel=('PC-50 Shino (chart only, not on amaco.com)', c6(3, 1)), c10_rel=('PC-50', C10['PC-50']),
                   photo=I + 'sh-11-chai-gloss__SH-11_Chai_Gloss_2048px_JPG_WEB__22658.1658905730.jpg',
                   photo2=I + 'sh-11-chai-gloss__SH-11_Chai_Gloss_Bowl_2048px__16604.1658905730.jpg'),
 'crackle':   dict(code='KI-11', name='Snow Drift', url=AM + 'ki-11-snow-drift/',
                   photo=I + 'ki-11-snow-drift__KI-11_Snow_Drift_ApplicationTiles__66670.1752695412.jpg',
                   rects={'thin': [200, 138, 356, 300], 'thick': [925, 381, 1087, 550]}, show=[170, 110, 1110, 560]),
 'matte':     dict(code='SM-11', name='White (Satin Matte)', url=AM + 'sm-11-white/', photo=I + 'sm-11-white__ProductImages_SM-11__06469.1722961950.jpg'),
 'cobalt':    dict(code='C-20', name='Cobalt (Celadon)', url=AM + 'c-20-cobalt/', photo=I + 'c-20-cobalt__C-20_Cobalt__20355.1659540306.jpg',
                   photo2=I + 'c-20-cobalt__c20-cobalt-label-tile-2048px__68299.1659540306.jpg'),
 'copper':    dict(code='PC-70', name='Copper Red', url=AM + 'pc-70-copper-red/', photo=I + 'pc-70-copper-red__PC-70CopperRed_GlazeChip_6x6__28241.1663170559.jpg'),
 'ash':       None,   # no AMACO wood-ash glaze
 'rutile':    dict(code='PC-20', name='Blue Rutile', url=AM + 'pc-20-blue-rutile/', c6=c6(0, 1), c10=C10['PC-20'],
                   app=I + 'pc-20-blue-rutile__large_pc20-application-tiles-and-sake-cup-2048px__86186.1659532780.jpg',
                   photo=I + 'pc-20-blue-rutile__PC-20_6x6_Label_Tile_Chip-hires__54961.1659532780.jpg'),
 'turquoise': dict(code='HF-125', name='Turquoise', url=AM + 'hf-125-turquoise/', photo=I + 'hf-125-turquoise__HF-125_Turquoise_35505E_6x6_Square_Tile_WEB__99015.1708018968.jpg'),
 'seaweed':   dict(code='PC-42', name='Seaweed', url=AM + 'pc-42-seaweed/', c6=c6(1, 3, True), c10=C10['PC-42'],
                   app=I + 'pc-42-seaweed__large_pc42-application-tiles-and-sake-cup-2048px__46539.1659465238.jpg',
                   photo=I + 'pc-42-seaweed__PC-42_6x6_Lablel_Tile_Chip-hires__74984.1659465238.jpg'),
 'chartreuse':dict(code='HF-142', name='Chartreuse', url=AM + 'hf-142-chartreuse/', photo=I + 'hf-142-chartreuse__HF-142_Chartreuse_35510M_6x6_Square_Tile_WEB__97561.1708020213.jpg'),
 'yellow':    dict(code='HF-161', name='Bright Yellow', url=AM + 'hf-161-bright-yellow/', photo=I + 'hf-161-bright-yellow__HF-161_Bright_Yellow_Bowl_sized__41094.1659536247.jpg'),
 'orange':    dict(code='HF-167', name='Clementine', url=AM + 'hf-167-clementine/', photo=I + 'hf-167-clementine__HF-167_Clementtine_Bowl_sized__97160.1659535817.jpg'),
 'amber':     dict(code='PC-68', name='Golden Honey', url=AM + 'pc-68-golden-honey/', photo=I + 'pc-68-golden-honey__PC-68_GoldenHoney_Cone5_WEB__87996.1711484588.jpg',
                   photo2=I + 'pc-68-golden-honey__PC-68_GoldenHoney_ApplicationTiles__14015.1711484588.jpg', rects2={'thin': [72, 90, 138, 190], 'thick': [437, 90, 503, 190]}),
 'ironred':   dict(code='PC-59', name='Deep Firebrick', url=AM + 'pc-59-deep-firebrick/', c6=c6(4, 1), c10=C10['PC-59'],
                   app=I + 'pc-59-deep-firebrick__large_pc59-application-tiles-and-sake-cup-2048px__43383.1787168993.jpg',
                   photo=I + 'pc-59-deep-firebrick__PC-59_6x6_Label_Tile_Chip-hires__03366.1787168993.jpg'),
 'rose':      dict(code='C-50', name='Cherry Blossom (Celadon)', url=AM + 'c-50-cherry-blossom/', photo=I + 'c-50-cherry-blossom__C-50_Cherry_Blossom__52571.1659538624.jpg',
                   photo2=I + 'c-50-cherry-blossom__c50-cherry-blossom-label-tile-2048px__56994.1659538624.jpg'),
 'plum':      dict(code='C-57', name='Mulberry (Celadon)', url=AM + 'c-57-mulberry/', photo=I + 'c-57-mulberry__C-57Mulberry_Cone5_Chip-HiRes1__22341.1663158848.jpg',
                   photo2=I + 'c-57-mulberry__C-57Mulberry_Tile-HiRes_WEB__80652.1704403947.jpg'),
 'oatmeal':   dict(code='PC-31', name='Oatmeal', url=AM + 'pc-31-oatmeal/', c6=c6(1, 3), c10=C10['PC-31'],
                   app=I + 'pc-31-oatmeal__large_pc31-application-tiles-and-sake-cup-2048px__74661.1659533729.jpg',
                   photo=I + 'pc-31-oatmeal__PC-31_6x6_Label_Tile_Chip-hires__71374.1659533730.jpg'),
 'blackmatte':dict(code='SM-1', name='Black (Satin Matte)', url=AM + 'sm-01-black/', photo=I + 'sm-01-black__ProductImages_SM-1__44863.1722960570.jpg'),
 'bronze':    dict(code='PC-2', name='Saturation Gold', url=AM + 'pc-02-saturation-gold/', c6=c6(0, 1, True), c10=C10['PC-2'],
                   app=I + 'pc-02-saturation-gold__large_pc2-application-tiles-and-sake-cup-2048px__74700.1659532908.jpg',
                   photo=I + 'pc-02-saturation-gold__PC-2_6x6_Label_Tile_Chip-hires__96178.1659532908.jpg'),
}
