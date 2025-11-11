# PDF Export Feature - Deployment Notes

## Changes Made

1. **New PDF Export Route**: `/api/export/bookings/pdf`
2. **New Dependencies**: `pdfmake` package
3. **New Files**:
   - `server/utils/pdfGenerator.js` - PDF generation logic
   - `server/utils/downloadFonts.js` - Font download utility
   - `server/utils/fonts/` - Font files directory

## Deployment Steps for Render

### 1. Push Code to Git
```bash
git add .
git commit -m "Add PDF export functionality"
git push
```

### 2. Render Will Auto-Deploy
- Render will automatically detect the changes
- It will run `npm install` to install `pdfmake`
- The server will restart with the new code

### 3. Verify Deployment
After deployment, test the endpoint:
```
GET https://saintmark-bookingsystem-backend.onrender.com/api/export/test
```

Expected response:
```json
{
  "message": "Export route is working",
  "timestamp": "2025-11-11T..."
}
```

### 4. Font Download
- Fonts will be automatically downloaded on first PDF generation
- Or you can manually download by running: `node utils/downloadFonts.js`
- Font file: `server/utils/fonts/Roboto-Regular.ttf`

## Testing

1. **Test Route**: Visit `/api/export/test` (no auth required)
2. **Test PDF Export**: Use the admin dashboard "تصدير PDF" button
3. **Check Logs**: View Render logs for any errors

## Troubleshooting

### 404 Error
- **Cause**: Route not deployed yet
- **Solution**: Wait for Render deployment to complete, then verify route exists

### Font Errors
- **Cause**: Font file not found
- **Solution**: Fonts will auto-download on first use, or manually download

### PDF Generation Fails
- **Check**: Render logs for detailed error messages
- **Verify**: `pdfmake` is installed in `package.json`
- **Verify**: Font file exists in `server/utils/fonts/`

## Environment Variables

No new environment variables required.

## Dependencies

New dependency added to `package.json`:
- `pdfmake`: ^0.2.10

Render will install this automatically during deployment.

