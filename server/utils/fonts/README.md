# Fonts Directory

This directory contains the Roboto font files required for PDF generation.

## Automatic Download

The PDF generator will automatically download the Roboto font on first use if it's not found in this directory.

## Manual Setup

If you prefer to set up fonts manually, you can:

1. Download Roboto-Regular.ttf from Google Fonts
2. Place it in this directory (`server/utils/fonts/Roboto-Regular.ttf`)
3. The font will be used for all text styles (normal, bold, italic, bold-italic)

## Font Files Required

- `Roboto-Regular.ttf` - Main font file (required)

Note: Currently, the same font file is used for all styles. For better typography, you can add:
- `Roboto-Medium.ttf` (for bold)
- `Roboto-Italic.ttf` (for italic)
- `Roboto-MediumItalic.ttf` (for bold-italic)

