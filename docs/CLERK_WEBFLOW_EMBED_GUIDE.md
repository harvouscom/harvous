# Clerk Authentication Embed for Webflow

This guide covers how to embed Clerk's authentication components (sign-up and sign-in) into your Webflow marketing site, with sign-up on the marketing site and sign-in redirecting to `app.harvous.com`.

## Overview

**Why This Approach?**

✅ **Full Control**: Complete customization of styling to match your brand  
✅ **Seamless UX**: Users sign up on marketing site, sign in on app  
✅ **Cross-Domain Auth**: Clerk's satellite domain feature handles authentication across domains  
✅ **Consistent Design**: Matches your existing Harvous design system  
✅ **Production Ready**: Uses Clerk's official JavaScript SDK

## Architecture

```
Marketing Site (Webflow)
├── Sign-Up Page → Uses Clerk JavaScript SDK
└── After sign-up → Redirects to app.harvous.com

App Site (app.harvous.com)
├── Sign-In Page → Uses Clerk Astro components
└── Protected routes → Middleware handles auth
```

## Prerequisites

1. **Clerk Account**: Active Clerk account with production keys
2. **Domain Configuration**: Both domains configured in Clerk Dashboard
3. **Publishable Key**: Your `PUBLIC_CLERK_PUBLISHABLE_KEY` from environment variables

## Step 1: Configure Clerk Dashboard

### 1.1 Set Up Satellite Domains

1. Go to **Clerk Dashboard** → **Domains**
2. Add your marketing domain (e.g., `www.harvous.com` or `harvous.com`) as a **Satellite Domain**
3. Ensure `app.harvous.com` is set as your **Primary Domain**
4. This enables cross-domain authentication sessions

### 1.2 Configure Redirect URLs

In Clerk Dashboard → **Paths**:
- **Sign-up redirect**: `https://app.harvous.com` (or `/sign-in` if preferred)
- **Sign-in redirect**: `https://app.harvous.com`
- **After sign-out**: `https://www.harvous.com` (or your marketing homepage)

## Step 2: Add Sign-Up Embed to Webflow

### 2.1 Create Embed Element

1. In Webflow Designer, navigate to your sign-up page
2. Add an **Embed** element where you want the sign-up form
3. Give it an ID: `clerk-sign-up` (or use the Webflow element ID)

### 2.2 Add Embed Code

Paste this code into the Embed element's **Custom Code** field:

```html
<!-- Clerk Sign-Up Embed for Webflow -->
<div id="clerk-sign-up"></div>

<script>
  (function() {
    // Load Clerk's JavaScript SDK
    const script = document.createElement('script');
    script.src = 'https://cdn.clerk.com/clerk.js';
    script.async = true;
    script.onload = function() {
      // Initialize Clerk
      window.Clerk = window.Clerk || {};
      window.Clerk.load({
        publishableKey: 'YOUR_PUBLISHABLE_KEY_HERE' // Replace with your actual key
      }).then(() => {
        // Mount the SignUp component
        window.Clerk.mountSignUp('#clerk-sign-up', {
          appearance: {
            variables: {
              colorPrimary: '#006EFF',        // --color-bold-blue
              colorText: '#4A473D',           // --color-deep-grey
              colorTextSecondary: '#78766F',  // --color-stone-grey
              colorBackground: '#FFFFFF',
              colorInputBackground: '#F8F8F8',
              colorInputText: '#4A473D',
              borderRadius: '24px',           // rounded-3xl
              fontFamily: '"Reddit Sans", system-ui, sans-serif',
            },
            elements: {
              rootBox: "w-full max-w-md mx-auto",
              card: "bg-white rounded-2xl shadow-lg p-8",
              headerTitle: "text-2xl font-bold text-[#4A473D] mb-0",
              headerSubtitle: "text-[#78766F] mb-3",
              formField: "mb-3",
              formFieldLabel: "hidden",
              formFieldInput: "rounded-3xl py-5 px-4 min-h-[64px] bg-transparent border-none text-[18px] font-semibold text-[#4A473D] text-center placeholder:text-[#888680] focus:outline-none focus:ring-0",
              formButtonPrimary: "group relative rounded-3xl cursor-pointer transition-all duration-300 pb-7 pt-6 px-6 flex items-center justify-center font-sans font-semibold text-[18px] leading-[0] text-nowrap text-[#F7F7F6] min-h-[60px] w-full bg-[#006EFF] hover:bg-[#006EFF]",
              footerActionLink: "text-[#006EFF] hover:text-[#0048A6] font-medium",
              dividerLine: "bg-[#E9E9E9]",
              dividerText: "text-[#78766F] bg-white px-4",
              socialButtonsBlockButton: "rounded-3xl border border-[#E9E9E9] hover:bg-[#F3F2EC]",
              socialButtonsBlockButtonText: "text-[#4A473D] font-semibold",
            }
          },
          signInUrl: "https://app.harvous.com/sign-in",
          redirectUrl: "https://app.harvous.com",
          additionalFields: [
            {
              name: 'first_name',
              label: 'First Name',
              required: true,
            },
            {
              name: 'last_name',
              label: 'Last Name',
              required: true,
            },
          ]
        });
      });
    };
    document.head.appendChild(script);
  })();
</script>

<style>
  /* Container styling */
  #clerk-sign-up {
    width: 100%;
    max-width: 448px;
    margin: 0 auto;
  }
  
  /* Input field styling to match Harvous design */
  #clerk-sign-up input[type="email"],
  #clerk-sign-up input[type="password"],
  #clerk-sign-up input[type="text"] {
    background: linear-gradient(126.64deg, rgba(255, 255, 255, 0.8) 11.71%, #F8F8F8 71.33%) !important;
    box-shadow: inset 0px -3px 0px rgba(120, 118, 111, 0.2) !important;
  }
  
  /* Primary button styling - matches Button.astro */
  #clerk-sign-up button[type="submit"] {
    background-color: #006EFF !important;
    box-shadow: 
      0px -8px 0px 0px hsla(0, 0%, 0%, 0.1) inset,
      0px 4px 4px 0px hsla(0, 0%, 0%, 0.25) !important;
    transition: all 0.125s ease-in-out !important;
  }
  
  #clerk-sign-up button[type="submit"]:hover {
    background-color: #006EFF !important;
  }
  
  #clerk-sign-up button[type="submit"]:active {
    transform: scale(0.98) !important;
    background-color: #0048A6 !important;
    box-shadow: 
      0px -4px 0px 0px #0000001a inset,
      0px 0px 4px 0px #00000040,
      0px 4px 0px 0px #00000040 inset !important;
  }
  
  /* Hide button icons/arrows */
  #clerk-sign-up button[type="submit"] svg,
  #clerk-sign-up button[type="submit"] img,
  #clerk-sign-up button[type="submit"]::after,
  #clerk-sign-up button[type="submit"]::before {
    display: none !important;
  }
  
  /* Spacing between form elements - 12px */
  #clerk-sign-up [data-clerk-element="formField"] {
    margin-bottom: 12px !important;
  }
  
  #clerk-sign-up [data-clerk-element="form"] {
    gap: 0 !important;
    row-gap: 12px !important;
  }
  
  /* Ensure button text is centered */
  #clerk-sign-up button[type="submit"] {
    justify-content: center !important;
  }
</style>
```

### 2.3 Replace Publishable Key

**Important**: Replace `YOUR_PUBLISHABLE_KEY_HERE` with your actual Clerk publishable key:

- **Development**: Use your test key from `.env` file
- **Production**: Use your live key from Clerk Dashboard

You can find your key in:
- Your `.env` file: `PUBLIC_CLERK_PUBLISHABLE_KEY`
- Clerk Dashboard → **API Keys** → **Publishable key**

## Step 3: Customize Styling (Optional)

### 3.1 Design System Colors

Reference your Harvous color system:

| Element | CSS Variable | Hex Value | Usage |
|---------|-------------|-----------|-------|
| Primary Button | `--color-bold-blue` | `#006EFF` | Main actions |
| Button Active | `--color-navy` | `#0048A6` | Pressed state |
| Text Primary | `--color-deep-grey` | `#4A473D` | Headings, body text |
| Text Secondary | `--color-stone-grey` | `#78766F` | Subtitles, labels |
| Placeholder | `--color-pebble-grey` | `#888680` | Input placeholders |
| Background | `--color-light-paper` | `#F3F2EC` | Page background |
| Input Background | `--color-gradient-gray` | Gradient | Input fields |
| Border | `--color-gray` | `#E9E9E9` | Dividers, borders |

### 3.2 Common Customizations

**Change Button Color:**
```javascript
variables: {
  colorPrimary: '#YOUR_COLOR', // Update this
}
```

**Change Input Styling:**
```javascript
elements: {
  formFieldInput: "rounded-3xl py-5 px-4 min-h-[64px] ...", // Modify classes
}
```

**Adjust Spacing:**
```css
#clerk-sign-up [data-clerk-element="formField"] {
  margin-bottom: 12px !important; /* Change this value */
}
```

## Step 4: Test the Integration

### 4.1 Testing Checklist

- [ ] **Sign-up flow**: Complete sign-up on marketing site
- [ ] **Redirect**: Verify redirect to `app.harvous.com` after sign-up
- [ ] **Session persistence**: Check that user is authenticated on app
- [ ] **Sign-in link**: Click "Sign in" link redirects to `app.harvous.com/sign-in`
- [ ] **Mobile responsive**: Test on mobile devices
- [ ] **Cross-browser**: Test in Chrome, Safari, Firefox
- [ ] **Error handling**: Test with invalid inputs

### 4.2 Debugging Tips

**Check Browser Console:**
- Open DevTools (F12) → Console tab
- Look for Clerk initialization errors
- Check for network errors loading Clerk SDK

**Inspect Elements:**
- Right-click form → Inspect Element
- Verify Clerk elements are rendering
- Check computed styles match expectations

**Verify Configuration:**
- Confirm publishable key is correct
- Check Clerk Dashboard domain settings
- Verify redirect URLs match configuration

## Step 5: Production Deployment

### 5.1 Environment Variables

Ensure your production environment has:

```env
PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...  # Production key
CLERK_SECRET_KEY=sk_live_...              # Production secret
```

### 5.2 Webflow Publishing

1. **Test in Webflow Preview** first
2. **Publish** your site when ready
3. **Verify** sign-up works on live site
4. **Monitor** Clerk Dashboard for errors

### 5.3 Security Considerations

- ✅ **Never expose** `CLERK_SECRET_KEY` in client-side code
- ✅ **Use HTTPS** for all authentication flows
- ✅ **Enable** Clerk's security features (rate limiting, etc.)
- ✅ **Monitor** Clerk Dashboard for suspicious activity

## Troubleshooting

### Issue: Clerk component not loading

**Solution:**
- Check browser console for errors
- Verify publishable key is correct
- Ensure Clerk SDK script loads (check Network tab)
- Check if ad blockers are interfering

### Issue: Styling not applying

**Solution:**
- Use `!important` flags in CSS (as shown in examples)
- Check for CSS specificity conflicts
- Inspect element to see computed styles
- Verify Tailwind classes work in Webflow (may need inline styles)

### Issue: Redirect not working

**Solution:**
- Verify `redirectUrl` in mountSignUp config
- Check Clerk Dashboard redirect URL settings
- Ensure satellite domain is configured correctly
- Test redirect URL is accessible

### Issue: Cross-domain session not persisting

**Solution:**
- Verify satellite domain is set up in Clerk Dashboard
- Check cookie settings (should be handled by Clerk)
- Ensure both domains use HTTPS
- Clear browser cookies and test again

## Alternative: Iframe Approach

If the JavaScript SDK approach doesn't work, you can use Clerk's hosted pages:

```html
<iframe 
  src="https://YOUR_CLERK_INSTANCE.clerk.accounts.dev/sign-up?redirect_url=https://app.harvous.com"
  style="width: 100%; min-height: 600px; border: none;"
  title="Sign Up">
</iframe>
```

**Note**: This approach offers less styling control but is simpler to implement.

## Reference: Current Astro Implementation

For reference, your current Astro sign-in page (`src/pages/sign-in.astro`) uses:

- Clerk Astro components (`@clerk/astro/components`)
- Custom styling matching your design system
- 12px spacing between form elements
- Rounded inputs (`rounded-3xl`)
- Gradient input backgrounds
- Custom button styling with active states

The Webflow embed should match this styling for consistency.

## Additional Resources

- [Clerk JavaScript SDK Docs](https://clerk.com/docs/references/javascript/overview)
- [Clerk Appearance Customization](https://clerk.com/docs/customization/overview)
- [Clerk Satellite Domains](https://clerk.com/docs/guides/dashboard/dns-domains/satellite-domains)
- [Clerk Redirect URLs](https://clerk.com/docs/guides/development/customize-redirect-urls)

## Summary

This custom embed approach provides:

✅ Full control over styling and UX  
✅ Seamless integration with your design system  
✅ Cross-domain authentication support  
✅ Production-ready implementation  
✅ Easy customization and maintenance

The method is **recommended** for production use as it gives you complete control while leveraging Clerk's robust authentication infrastructure.

