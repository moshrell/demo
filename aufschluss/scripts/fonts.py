"""Schriften verkleinern (einmalig, Ergebnis liegt in src/fonts/, keine Abhängigkeit beim Build).
Quelle: @fontsource-variable/archivo + atkinson-hyperlegible-next (OFL). Aufruf: python3 scripts/fonts.py
Archivo: Breite (wdth) und Gewicht (wght) fixiert -> eine statische Display-Datei.
Atkinson Hyperlegible Next: Gewichtsachse auf 400–700 begrenzt.
Zeichen: Basic Latin, Latin-1 (Umlaute, ß), Satzzeichen, €, Pfeile."""
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset
import sys, os
NM = 'node_modules/@fontsource-variable'
OUT = 'src/fonts'
os.makedirs(OUT, exist_ok=True)
UNI = 'U+0020-007E,U+00A0-00FF,U+2013-2014,U+2018-201E,U+2022,U+2026,U+20AC,U+2190-2193,U+2212,U+00B7,U+2009,U+202F'

def build(src, axes, dst, keep_layout=True):
    f = TTFont(src, lazy=False)
    print(src, {a.axisTag: (a.minValue, a.maxValue) for a in f['fvar'].axes})
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['kern', 'liga', 'tnum', 'lnum', 'case', 'ss01'] if keep_layout else []
    opts.unicodes = subset.parse_unicodes(UNI)
    s = subset.Subsetter(opts)
    s.populate(unicodes=opts.unicodes)
    s.subset(f)
    f = instancer.instantiateVariableFont(f, axes)
    f.flavor = 'woff2'
    f.save(dst)
    print(dst, os.path.getsize(dst))

build(f'{NM}/archivo/files/archivo-latin-wdth-normal.woff2', {'wdth': 125, 'wght': 800}, f'{OUT}/archivo-wide-800.woff2')
build(f'{NM}/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-normal.woff2', {'wght': (400, 700)}, f'{OUT}/atkinson-400-700.woff2')
