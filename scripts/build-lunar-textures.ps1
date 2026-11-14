# Build and prepare authentic NASA Lunar textures for To Land or Not to Land 3D Globe
param(
    [string]$TargetDir = "$PSScriptRoot\..\client\public\textures",
    [int]$TextureWidth = 2048,
    [int]$TextureHeight = 1024
)

$ErrorActionPreference = "Stop"

Write-Host "==> Ensuring target directory exists: $TargetDir"
if (-not (Test-Path $TargetDir)) {
    New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
}

$tempDir = Join-Path $env:TEMP "nasa_lunar_build"
if (-not (Test-Path $tempDir)) {
    New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
}

$csharpSource = @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public class LunarTextureProcessor {
    public static void ProcessTextures(string demPath, string outSlopePng, string outBumpJpg, int width, int height) {
        using (Bitmap srcDem = new Bitmap(demPath)) {
            using (Bitmap dem = new Bitmap(width, height, PixelFormat.Format32bppArgb)) {
                using (Graphics g = Graphics.FromImage(dem)) {
                    g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                    g.DrawImage(srcDem, 0, 0, width, height);
                }

                Bitmap slopeBmp = new Bitmap(width, height, PixelFormat.Format32bppArgb);
                Bitmap bumpBmp = new Bitmap(width, height, PixelFormat.Format32bppArgb);

                BitmapData demData = dem.LockBits(new Rectangle(0, 0, width, height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
                BitmapData slopeData = slopeBmp.LockBits(new Rectangle(0, 0, width, height), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
                BitmapData bumpData = bumpBmp.LockBits(new Rectangle(0, 0, width, height), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);

                int bytes = Math.Abs(demData.Stride) * height;
                byte[] demPixels = new byte[bytes];
                byte[] slopePixels = new byte[bytes];
                byte[] bumpPixels = new byte[bytes];

                Marshal.Copy(demData.Scan0, demPixels, 0, bytes);

                int stride = demData.Stride;
                double moonCircumferenceM = 10921000.0;
                double dxBase = moonCircumferenceM / width;
                double dy = (moonCircumferenceM / 2.0) / height;
                double elevationScale = 180.0; // Dynamic scale for pixel delta to meters

                for (int y = 0; y < height; y++) {
                    double lat = 90.0 - (y * 180.0 / height);
                    double cosLat = Math.Max(0.06, Math.Cos(lat * Math.PI / 180.0));
                    double dx = dxBase * cosLat;

                    int yPrev = Math.Max(0, y - 1);
                    int yNext = Math.Min(height - 1, y + 1);

                    for (int x = 0; x < width; x++) {
                        int xPrev = (x - 1 + width) % width;
                        int xNext = (x + 1) % width;

                        int idx = y * stride + x * 4;
                        int idxL = y * stride + xPrev * 4;
                        int idxR = y * stride + xNext * 4;
                        int idxU = yPrev * stride + x * 4;
                        int idxD = yNext * stride + x * 4;

                        // Grayscale LOLA elevation value
                        int h = demPixels[idx];
                        int hL = demPixels[idxL];
                        int hR = demPixels[idxR];
                        int hU = demPixels[idxU];
                        int hD = demPixels[idxD];

                        // Bump Map (Normalized high-contrast grayscale for Three.js lighting)
                        byte bumpVal = (byte)Math.Max(0, Math.Min(255, h));
                        bumpPixels[idx] = bumpVal;
                        bumpPixels[idx + 1] = bumpVal;
                        bumpPixels[idx + 2] = bumpVal;
                        bumpPixels[idx + 3] = 255;

                        // Calculate physical slope gradient
                        double dz_dx = ((hR - hL) * elevationScale) / (2.0 * dx);
                        double dz_dy = ((hD - hU) * elevationScale) / (2.0 * dy);
                        double slopeDeg = Math.Atan(Math.Sqrt(dz_dx * dz_dx + dz_dy * dz_dy)) * (180.0 / Math.PI);

                        // True LOLA slope coloring with semi-transparency (alpha = 140 / ~55% opacity)
                        // Allows the underlying authentic crater geology to shine through
                        byte r, gCol, b;
                        byte alpha = 140;

                        if (slopeDeg < 5.0) {
                            // Safe landing zone (<5 deg): Emerald Green (#10b981)
                            double t = slopeDeg / 5.0;
                            r = (byte)(16 + t * 40);
                            gCol = (byte)(185 - t * 20);
                            b = (byte)(129 - t * 30);
                        } else if (slopeDeg < 15.0) {
                            // Caution zone (5 - 15 deg): Golden Amber / Yellow (#eab308)
                            double t = (slopeDeg - 5.0) / 10.0;
                            r = (byte)(234 + t * 15);
                            gCol = (byte)(179 - t * 30);
                            b = (byte)(8 + t * 10);
                        } else {
                            // Hazard zone (>15 deg): Red / Crimson (#ef4444)
                            double t = Math.Min(1.0, (slopeDeg - 15.0) / 15.0);
                            r = (byte)(239 - t * 20);
                            gCol = (byte)(68 - t * 30);
                            b = (byte)(68 - t * 30);
                        }

                        slopePixels[idx] = b;
                        slopePixels[idx + 1] = gCol;
                        slopePixels[idx + 2] = r;
                        slopePixels[idx + 3] = alpha;
                    }
                }

                Marshal.Copy(slopePixels, 0, slopeData.Scan0, bytes);
                Marshal.Copy(bumpPixels, 0, bumpData.Scan0, bytes);

                dem.UnlockBits(demData);
                slopeBmp.UnlockBits(slopeData);
                bumpBmp.UnlockBits(bumpData);

                slopeBmp.Save(outSlopePng, ImageFormat.Png);

                ImageCodecInfo jpgCodec = null;
                foreach (ImageCodecInfo codec in ImageCodecInfo.GetImageEncoders()) {
                    if (codec.FormatDescription == "JPEG") {
                        jpgCodec = codec;
                        break;
                    }
                }
                EncoderParameters ep = new EncoderParameters(1);
                ep.Param[0] = new EncoderParameter(Encoder.Quality, 92L);
                bumpBmp.Save(outBumpJpg, jpgCodec, ep);

                slopeBmp.Dispose();
                bumpBmp.Dispose();
            }
        }
    }

    public static void ConvertTifToJpg(string tifPath, string outJpgPath, long quality) {
        using (Bitmap bmp = new Bitmap(tifPath)) {
            ImageCodecInfo jpgCodec = null;
            foreach (ImageCodecInfo codec in ImageCodecInfo.GetImageEncoders()) {
                if (codec.FormatDescription == "JPEG") {
                    jpgCodec = codec;
                    break;
                }
            }
            EncoderParameters ep = new EncoderParameters(1);
            ep.Param[0] = new EncoderParameter(Encoder.Quality, quality);
            bmp.Save(outJpgPath, jpgCodec, ep);
        }
    }
}
"@

Add-Type -TypeDefinition $csharpSource -ReferencedAssemblies "System.Drawing"

# 1. Download NASA LRO LROC Polar-Enhanced Color Map (4K TIFF)
$polarTif = Join-Path $tempDir "lroc_color_poles_4k.tif"
$polarJpg = Join-Path $TargetDir "lroc_color_poles_4k.jpg"

if (-not (Test-Path $polarJpg)) {
    if (-not (Test-Path $polarTif)) {
        Write-Host "==> Downloading NASA LRO LROC Polar 4K mosaic..."
        curl.exe -s "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_4k.tif" -o $polarTif
    }
    Write-Host "==> Converting LROC Polar 4K TIFF to high-quality JPEG..."
    [LunarTextureProcessor]::ConvertTifToJpg($polarTif, $polarJpg, 92)
}

# 2. Download NASA LOLA Elevation Map & Generate Slope / Bump maps
$demTif = Join-Path $tempDir "ldem_16_uint.tif"
$outSlopePng = Join-Path $TargetDir "lola_slope_overlay_2k.png"
$outBumpJpg = Join-Path $TargetDir "lola_bump_2k.jpg"

if (-not (Test-Path $demTif)) {
    Write-Host "==> Downloading NASA LOLA LDEM_16 elevation data..."
    curl.exe -s "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_16_uint.tif" -o $demTif
}

Write-Host "==> Processing NASA LOLA elevation data into Slope Heatmap and Bump Map..."
[LunarTextureProcessor]::ProcessTextures($demTif, $outSlopePng, $outBumpJpg, $TextureWidth, $TextureHeight)

# Also copy standard 2K photographic albedo texture
$albedo2kJpg = Join-Path $TargetDir "lroc_color_2k.jpg"
if (-not (Test-Path $albedo2kJpg)) {
    Write-Host "==> Downloading NASA LRO LROC 2K standard albedo texture..."
    curl.exe -s "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg" -o $albedo2kJpg
}

Write-Host "==> Authentic NASA Lunar Texture Pipeline Complete!"
Get-ChildItem $TargetDir | Select-Object Name, Length
