# Camera OCR Feature - Native iOS/Android Implementation

**Status:** Future Feature (Native Apps Only)  
**Platform:** iOS & Android Native Apps (via Capacitor)  
**Not Available:** PWA/Web Browser  
**Last Updated:** January 2026

---

## Overview

Add camera-based OCR (Optical Character Recognition) functionality that allows users to scan handwritten notes from images and insert the extracted text directly into the TipTap editor. This feature will be **exclusively available in native iOS and Android apps**, not in the PWA/web version.

## Why Native Apps Only?

### Primary Use Case: Handwritten Text
The primary intent of this feature is to capture **handwritten notes**, not printed text. This requires high-quality OCR that can accurately recognize handwriting.

### Technical Limitations of Web/PWA
- **Tesseract.js** (web OCR library): Only ~30-50% accurate for handwritten text - not suitable for primary use case
- **Cloud OCR APIs**: Privacy concerns (images sent to third parties), requires internet, adds cost
- **Browser limitations**: Limited access to device camera capabilities

### Native OS Advantages
- **iOS Vision Framework**: Excellent handwritten text recognition (~85-95% accuracy), privacy-first (on-device), offline-capable
- **Android ML Kit**: Strong handwritten text recognition, privacy-first (on-device), offline-capable
- **Better UX**: Native camera integration, better performance, seamless user experience
- **Free**: No API costs, unlimited usage

## Implementation Strategy

### Phase 1: Native iOS Implementation

**Technology:** iOS Vision Framework with Handwriting Recognition

**Key Features:**
- Camera capture using native iOS camera
- Text recognition using `VNRecognizeTextRequest` with handwriting support
- Real-time text detection preview
- Confidence scoring
- Text insertion into TipTap editor

**Implementation Steps:**

1. **Add Camera Permission**
   - Update `ios/App/App/Info.plist`:
     ```xml
     <key>NSCameraUsageDescription</key>
     <string>Harvous needs camera access to scan your handwritten notes</string>
     ```

2. **Install Capacitor Camera Plugin**
   ```bash
   npm install @capacitor/camera
   npx cap sync
   ```

3. **Create Native OCR Component**
   - File: `src/components/react/CameraOCRModal.tsx`
   - Use Capacitor Camera API for capture
   - Use iOS Vision framework via Capacitor plugin or native bridge
   - Process image and extract text
   - Return text to TipTap editor

4. **Add Camera Button to TipTap Toolbar**
   - File: `src/components/react/TiptapEditor.tsx`
   - Only show button when running in native app (detect via `Capacitor.isNativePlatform()`)
   - Open camera modal on click
   - Insert extracted text at cursor position

### Phase 2: Native Android Implementation

**Technology:** ML Kit Text Recognition

**Key Features:**
- Camera capture using native Android camera
- Text recognition using ML Kit Text Recognition API
- Handwritten text support
- Real-time processing
- Text insertion into TipTap editor

**Implementation Steps:**

1. **Add Camera Permission**
   - Update `android/app/src/main/AndroidManifest.xml`:
     ```xml
     <uses-permission android:name="android.permission.CAMERA" />
     ```

2. **Install Capacitor Camera Plugin**
   ```bash
   npm install @capacitor/camera
   npx cap sync
   ```

3. **Add ML Kit Dependency**
   - Update `android/app/build.gradle`:
     ```gradle
     dependencies {
         implementation 'com.google.mlkit:text-recognition:16.0.0'
     }
     ```

4. **Create Native OCR Component**
   - Similar structure to iOS version
   - Use ML Kit for text recognition
   - Process and return text to editor

## Technical Implementation

### Platform Detection

```typescript
import { Capacitor } from '@capacitor/core';

// Only show camera button in native apps
const isNative = Capacitor.isNativePlatform();
const isIOS = Capacitor.getPlatform() === 'ios';
const isAndroid = Capacitor.getPlatform() === 'android';
```

### Camera Capture (Capacitor)

```typescript
import { Camera } from '@capacitor/camera';

const captureImage = async () => {
  const image = await Camera.getPhoto({
    quality: 90,
    allowEditing: false,
    resultType: CameraResultType.Base64,
    source: CameraSource.Camera,
  });
  
  return image.base64String;
};
```

### iOS Vision Framework Integration

**Option A: Capacitor Plugin**
- Use existing `@capacitor-community/text-recognition` plugin if available
- Or create custom Capacitor plugin to bridge Vision framework

**Option B: Native Bridge**
- Create Swift plugin that uses Vision framework
- Expose to JavaScript via Capacitor bridge

```swift
// Example Swift code (would be in Capacitor plugin)
import Vision
import VisionKit

@objc public class TextRecognition: NSObject {
    @objc public func recognizeText(_ imageBase64: String, completion: @escaping (String?, Error?) -> Void) {
        // Convert base64 to UIImage
        // Use VNRecognizeTextRequest
        // Return recognized text
    }
}
```

### Android ML Kit Integration

```kotlin
// Example Kotlin code (would be in Capacitor plugin)
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions

fun recognizeText(imageBase64: String, callback: (String?, Error?) -> Unit) {
    val image = InputImage.fromBitmap(/* convert base64 to bitmap */)
    val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    
    recognizer.process(image)
        .addOnSuccessListener { visionText ->
            callback(visionText.text, null)
        }
        .addOnFailureListener { e ->
            callback(null, e)
        }
}
```

### Text Insertion into TipTap

```typescript
// In TiptapEditor component
const handleOCRResult = (extractedText: string) => {
  if (!editor) return;
  
  // Insert text at current cursor position
  editor.chain()
    .focus()
    .insertContent(extractedText)
    .run();
  
  // Show success toast
  window.dispatchEvent(new CustomEvent('toast', {
    detail: {
      message: 'Text extracted and inserted',
      type: 'success'
    }
  }));
};
```

## User Experience Flow

1. User taps camera button in TipTap toolbar (only visible in native apps)
2. Camera modal opens with live preview
3. User positions handwritten note in frame
4. User taps capture button
5. Image is processed using native OCR
6. Extracted text is displayed in preview
7. User can edit text before inserting
8. User confirms → text is inserted at cursor position in editor
9. Modal closes, editor is focused

## Error Handling

- **Camera permission denied**: Show friendly message with link to settings
- **No text detected**: Allow retry with better positioning/lighting
- **Low confidence**: Show warning, allow user to edit before inserting
- **Camera unavailable**: Show error message
- **Processing error**: Show error, allow retry

## Privacy & Security

- **100% On-Device Processing**: All OCR happens locally, no images sent to servers
- **No Data Collection**: Images are processed and discarded immediately
- **Privacy-First**: Aligns with app's privacy-first approach
- **Offline Capable**: Works without internet connection

## Performance Considerations

- **Lazy Loading**: Only load OCR libraries when camera button is clicked
- **Image Optimization**: Compress images before processing to improve speed
- **Background Processing**: Process OCR in background thread to avoid blocking UI
- **Caching**: Cache OCR results if user wants to retry

## Testing Checklist

### iOS
- [ ] Camera permission request works
- [ ] Camera preview displays correctly
- [ ] Image capture works
- [ ] OCR extracts handwritten text accurately
- [ ] Text inserts at cursor position
- [ ] Works in NewNotePanel
- [ ] Works in CardFullEditable
- [ ] Error handling for denied permissions
- [ ] Error handling for no text detected
- [ ] Works offline

### Android
- [ ] Camera permission request works
- [ ] Camera preview displays correctly
- [ ] Image capture works
- [ ] OCR extracts handwritten text accurately
- [ ] Text inserts at cursor position
- [ ] Works in NewNotePanel
- [ ] Works in CardFullEditable
- [ ] Error handling for denied permissions
- [ ] Error handling for no text detected
- [ ] Works offline

### Cross-Platform
- [ ] Camera button only shows in native apps (not PWA)
- [ ] Consistent UX between iOS and Android
- [ ] Performance is acceptable (< 3 seconds processing)
- [ ] Handles various handwriting styles
- [ ] Handles different lighting conditions

## Future Enhancements

- **Real-time Preview**: Show recognized text overlay on camera preview
- **Multi-language Support**: Support for non-English handwritten text
- **Batch Processing**: Process multiple images at once
- **Image Enhancement**: Auto-adjust brightness/contrast before OCR
- **Text Correction Suggestions**: AI-powered suggestions for unclear text
- **Export Options**: Allow exporting recognized text as separate note
- **Integration with Notes**: Auto-create note from scanned text

## Dependencies

```json
{
  "@capacitor/camera": "^6.0.0",
  "@capacitor/core": "^6.0.0"
}
```

**iOS:**
- Vision Framework (built into iOS, no additional dependencies)
- Camera framework (built into iOS)

**Android:**
- ML Kit Text Recognition: `com.google.mlkit:text-recognition:16.0.0`
- CameraX (for modern camera API)

## Related Documentation

- [Capacitor Implementation Guide](../docs/CAPACITOR_IMPLEMENTATION_GUIDE.md)
- [Capacitor Strategic Analysis](../docs/future/CAPACITOR_STRATEGIC_ANALYSIS.md)
- [iOS Vision Framework Documentation](https://developer.apple.com/documentation/vision)
- [Android ML Kit Documentation](https://developers.google.com/ml-kit/vision/text-recognition)

## Notes

- This feature is **not available in PWA/web version** - camera button will be hidden
- Implementation should wait until native iOS/Android apps are built
- Focus on handwritten text accuracy as primary use case
- Privacy-first approach: all processing on-device
- Offline-first: no internet required for OCR processing
