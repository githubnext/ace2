# Desktop icons

`ace.iconset` is the unchanged green icon from `ace-old/clients/app/icon.iconset`.
`canary.iconset` recolors each original PNG yellow while preserving its alpha, neutral background,
shape, shading, and dither texture. With ImageMagick 7, the color transform is `-modulate 100,130,75
-colorspace HSL -channel B -fx 'u.b + 0.22 * u.g' +channel -colorspace sRGB -depth 8`.

Electrobun selects the yellow set for canary and the green set for stable and development builds.
It compiles the selected set with macOS `iconutil`; ImageMagick is not a build dependency.
