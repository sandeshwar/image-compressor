# Tracking Setup Guide for Image Compressor

## 📊 Google Analytics Setup

### 1. Get Your Google Analytics ID
1. Go to [Google Analytics](https://analytics.google.com/)
2. Sign in with your Google account
3. Click "Start measuring" → Create account
4. Account name: "Image Compressor"
5. Property name: "Image Compressor Website"
6. Business size: "Small"
7. Industry: "Technology" or "Internet"
8. Time zone: Your local time zone
9. Click "Create"

### 2. Get Your Measurement ID
After creating the property:
1. Go to Admin → Data Streams → Web stream
2. Copy your "Measurement ID" (starts with "G-")
3. Replace `GA_MEASUREMENT_ID` in `index.html` with your actual ID

Example: If your ID is `G-XXXXXXXXXX`, update:
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-XXXXXXXXXX');
</script>
```

## 💰 Google AdSense Setup

### 1. Apply for AdSense
1. Go to [Google AdSense](https://www.google.com/adsense/start/)
2. Sign in with your Google account
3. Add your site: `https://sandeshwar.github.io/image-compressor`
4. Fill in your payment information
5. Wait for approval (usually 1-2 weeks)

### 2. Get Your AdSense Publisher ID
After approval:
1. Go to AdSense dashboard → Ads → Overview
2. Copy your "Publisher ID" (starts with "ca-pub-")
3. Replace `ca-pub-XXXXXXXXXXXXXXXX` in `index.html` with your actual ID

### 3. Create Ad Units
1. In AdSense, go to Ads → Ad units
2. Create these ad units:
   - **Top Banner**: Responsive, 728x90 minimum
   - **Bottom Banner**: Responsive, 728x90 minimum
   - **Sidebar (optional)**: 300x250 or 300x600
3. Copy the ad slot IDs and replace `XXXXXXXXXX` in the HTML

Example: If your ad slot ID is `1234567890`, update:
```html
<ins class="adsbygoogle"
     style="display:block"
     data-ad-client="ca-pub-YOUR_PUBLISHER_ID"
     data-ad-slot="1234567890"
     data-ad-format="auto"
     data-full-width-responsive="true"></ins>
```

## 🔧 Additional Tracking Options

### 1. Event Tracking (Optional)
Add this to `script.js` to track user interactions:

```javascript
// Track compression events
gtag('event', 'image_compress', {
    'event_category': 'engagement',
    'event_label': 'image_compressed'
});

// Track download events
gtag('event', 'download', {
    'event_category': 'engagement',
    'event_label': 'image_downloaded'
});
```

### 2. Custom Dimensions (Optional)
Track compression quality settings:
```javascript
gtag('event', 'compression_settings', {
    'event_category': 'settings',
    'event_label': `quality_${quality}_resize_${resize}`
});
```

## 📈 Monitoring Performance

### Google Analytics Reports to Watch:
1. **Audience → Overview**: Page views, unique visitors
2. **Behavior → Site Content**: Most popular pages
3. **Behavior → Events**: Compression and download actions
4. **Acquisition → All Traffic**: Where visitors come from

### AdSense Reports to Watch:
1. **Performance reports**: RPM, CPC, total earnings
2. **Ad units**: Best performing ad sizes
3. **Sites**: Page CTR and impression data

## ⚠️ Important Notes

1. **Don't click your own ads** - This will get your account banned
2. **Wait for AdSense approval** before showing real ads
3. **Test with sample ads** during development
4. **Keep the Privacy Policy updated** with any tracking changes
5. **Follow AdSense policies** - no prohibited content

## 🚀 Next Steps After Setup

1. **Deploy updated files** to GitHub Pages
2. **Verify tracking** is working in Google Analytics real-time reports
3. **Apply for AdSense** if you haven't already
4. **Promote your site** to get initial traffic
5. **Monitor performance** and optimize ad placements

## 📞 Support

- Google Analytics Help: https://support.google.com/analytics
- Google AdSense Help: https://support.google.com/adsense
- GitHub Pages Documentation: https://docs.github.com/en/pages

---

Your Image Compressor is now ready for comprehensive tracking and monetization! 🎉
