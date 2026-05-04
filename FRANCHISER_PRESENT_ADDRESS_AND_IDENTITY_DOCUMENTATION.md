# Franchiser Register — Profile Image, Present Address & Identity Details

This document describes how **Profile Image** (`profile-upload-section`), **Present Address** (including **Google Maps**), and **Identity Details** (including the **identity-upload-section** UI) work in `src/app/franchiser-register`, so you can reuse the same patterns in another project or component.

**Primary source files**

| Area | File |
|------|------|
| Template | `franchiser-register.component.html` — “Profile Image”, “Present Address”, “Identity Details” |
| Logic | `franchiser-register.component.ts` — profile upload, map, geocoding, area search, identity upload |
| Styles | `franchiser-register.component.scss` — `.profile-upload-*`, `.identity-upload-*`, `.area-dropdown`, `.map_*` |

---

## 1. Data model (what you bind to)

Present address and identity live under `franchiserDetails.personalInfo` (default shape in TS):

| Field | Purpose |
|-------|---------|
| `area` | “Select Area” — search / formatted address from Places / geocode |
| `doorno` | Door number |
| `street` | Street (required in UI) |
| `landmark` | Landmark |
| `country` | e.g. `'IN'` for India |
| `state` | State name (from list) |
| `city` | City (bound to **ngx-select**) |
| `pincode` | 6-digit pincode |
| `idType` | `'adhaar' \| 'driving_license' \| 'voterId' \| 'passport'` |
| `idNumber` | Masked/formatted identity number |
| `identity_image` | Object with `front`, `back`, `passport` (each holds upload metadata from API) |
| `profileimage` | Single object after upload: API `data` plus `date`, `time`, `mode`, `profilepic` — stores file metadata and `filepath` for the photo |

**Component state used for display** (not nested under `personalInfo` in the same way):

| Property | Purpose |
|----------|---------|
| `filepath` | URL/path bound to `<img [src]>` for the profile preview |
| `certificate` | Same reference as upload response object; used for delete + modal (`certificate?.filepath`, `certificate?.filename`) |

**Map coordinates** are kept in component state as `currentLocation: { lat, lng }`, not as separate `personalInfo.latitude` fields. When porting, decide whether to persist `lat`/`lng` on save by copying `currentLocation` into your API payload.

---

## 2. Profile Image — `profile-upload-section` design & behaviour

### 2.1 Where it lives in the template

- Inside **Personal Information** card, first column: **`col-md-3`**.
- Wrapper: **`.profile-upload-section`** with id `profileimage-container`.
- Sits beside **`.personal-details-grid`** (`col-md-9`) for name, mobile, etc.

### 2.2 HTML structure (layers)

1. **`.profile-image-container`** — positions the circle + actions.
2. **Empty state — `.profile-upload-btn`** (id `profileimage`):
   - Shown when **`!filepath`**.
   - **`(click)="uploadfile()"`** → programmatic click on hidden file input `#customFileEg1`.
   - Contains **`<input class="upload-input" type="file" accept=".jpg,.jpeg,.png" (change)="uploadImage($event, 'profile')">`**.
3. **Preview state — `.profile-image-display`** (id `profileimage-display`):
   - Shown when **`filepath`** is set.
   - **`<img class="profile-img" [src]="filepath">`** — click opens image modal via **`viewProfileImage(certificate?.filepath, certificate?.filename)`**.
   - **`.profile-actions`** — delete button **`deletefranchiserImage(1, certificate)`** when `certificate?.filename` exists.
4. **Progress** — **`.upload-progress-container`** when **`isUploading['profile']`**: bar + **`uploadProgress['profile']`** and `Math.round` in template.
5. **Copy block — `.upload-info`**:
   - **`.upload-title`**: “Profile Image” (required asterisk).
   - **`.upload-subtitle`**: “JPG/JPEG/PNG (Max 2MB)”.
   - **`.upload-error`**: shows **`uploadErrors['profile']`** if validation fails.

### 2.3 TypeScript — upload (`uploadImage($event, 'profile')`)

- **`uploadfile()`** triggers `#customFileEg1.click()`.
- Validates with **`validateFile(selectedFile, 'profile')`**:
  - Max **2 MB**.
  - Allowed MIME types include JPG/PNG and **PDF** in the shared validator (UI `accept` is images-only; backend path still uses `getUploadApiEndpoint` — PDF branch uses `franchiser/uploadfranchisedocument`, images use `franchiser/uploadFileImages`).
- Sets **`isUploading['profile']`**, simulated **`uploadProgress['profile']`**, posts **`FormData`** with **`files`**.
- On success:
  - **`filepath = res.data.filepath`** (image preview).
  - **`certificate = res.data`** enriched with `date`, `time`, `mode: 'create'`, **`profilepic: false`**.
  - **`franchiserDetails.personalInfo.profileimage = this.certificate`**.
  - Clears **field-error** on highlighted element for `profileimage` via **`findElementToHighlight` / `hideFieldErrorMessage`**.

### 2.4 TypeScript — delete

- **`deletefranchiserImage(1, certificate)`** (first argument `1` = profile):
  - Calls **`dataService.getfranchiserImagedelete({ mode: 'create', files: [file] })`**.
  - On success: clears **`personalInfo.profileimage`**, **`certificate`**, **`filepath`**, resets file input **`customFileEg1`**.

### 2.5 Loading existing data

- **`setFranchiseData()`** (or equivalent hydration path): sets **`filepath`** from **`personalInfo.profileimage.filepath`** and **`certificate`** from **`personalInfo.profileimage`**.

### 2.6 Validation / completeness

- Form checks treat **`personalInfo.profileimage`** as required (e.g. empty object fails validation).

### 2.7 SCSS — profile upload look & feel

| Class | Role |
|-------|------|
| `.profile-upload-section` | Column flex, centered, **gradient** background `#f8f9ff` → `#e8f0ff`, padding, rounded corners |
| `.profile-image-container` | Relative wrapper, bottom margin |
| `.profile-upload-btn` | **90×90 circle**, solid border `#2b3061`, flex column, camera icon + “Upload Photo” text |
| `.profile-upload-btn:hover` | Brighter fill, **gold** border `#FFC400`, slight scale |
| `.profile-image-display` | **90×90** relative box for image + actions |
| `.profile-img` | **Circular** image, `object-fit: cover`, **gold** border `#FFC400`, hover scale + shadow |
| `.profile-actions` | Absolutely positioned bottom-right overlay |
| `.btn-action.btn-delete` | Small circular red delete button |
| `.upload-info`, `.upload-title`, `.upload-subtitle` | Centered captions (Poppins, brand color `#2b3061`) |
| `.upload-progress-bar` / `.upload-progress-fill` | Same pattern as identity uploads |
| **Error state** | `.profile-upload-btn.field-error`, `.profile-upload-section.field-error` (see shared field-error block in same SCSS file) |

**Visual summary**: profile uses a **large circular** upload control and **circular crop preview** with **amber/gold accent** ring; identity section uses **smaller square** tiles — intentional visual hierarchy.

---

## 3. Present Address — field-by-field behaviour

### 3.1 Section layout (HTML)

- **Left column (≈ `col-lg-6`)**: address fields.
- **Right column**: map in `.map_box` with `<div id="map">`.

### 3.2 “Select Area” (typeahead + Places)

- **Input**: `[(ngModel)]="franchiserDetails.personalInfo.area"`, id `area`.
- **`(input)="onAreaSearch($event)"`**: if query length &gt; 2, runs place search.
- **`(blur)="hideAreaDropdown(); triggerAutoSave()"`**: closes dropdown after short delay.
- **`(ngModelChange)="remove_circls(); autoFillCompanyAddress()"`**: clears error CSS on related fields; may sync company address when “same as present” applies elsewhere.

**Dropdown**

- Shown when `showAreaDropdown && areaSearchResults.length > 0`.
- `mousedown` on item calls `selectArea(result)` (use `mousedown` so blur does not cancel selection before click).

### 3.3 GPS (current location)

- **Append button** on the area input group: `(click)="getCurrentLocation()"`, icon `fa-crosshairs`.
- **`getCurrentLocation()`**: `navigator.geolocation.getCurrentPosition` → updates `currentLocation`, centers map, moves marker, calls **`reverseGeocode(currentLocation)`** to fill `area` and parsed fields.

### 3.4 Door, street, landmark

| Field | Notes |
|-------|--------|
| Door No. | `onTextInput` strips non-alphanumeric except spaces |
| Street | required asterisk in label; same sanitizer + auto-save on blur / change |
| Landmark | optional; same pattern |

### 3.5 Country & state

- **Country**: select; currently **India** (`value="IN"`). **`(change)="getState(); autoFillCompanyAddress(); triggerAutoSave()"`** loads state list from backend (`getState()` uses `dataService` + `personalInfo.country`).
- **State**: options from `stateList`. **`(change)="getCityList(); ..."`** loads cities for **`IN/{state}`** style API used elsewhere in app.

### 3.6 City & pincode

- **City**: `ngx-select` with `[items]="cityList"`, `[(ngModel)]="franchiserDetails.personalInfo.city"`.
- **Pincode**: `onPincodeInput` keeps digits only, max 6.

---

## 4. Map — initialization and interaction

### 4.1 Lifecycle

- **`ngAfterViewInit()`** calls **`loadGoogleMaps()`** so `#map` exists in the DOM.
- **`loadGoogleMaps()`**:
  - If `typeof google !== 'undefined' && google.maps` → **`initializeMap()`**.
  - Else → **`initializeFallbackMap()`** (geolocation-only; sets `area` to a coordinate string).

### 4.2 `initializeMap()`

1. `this.geocoder = new google.maps.Geocoder()`.
2. **`getCurrentLocation()`** — seeds map center.
3. `new google.maps.Map(document.getElementById('map'), { center, zoom: 15, mapTypeId: ROADMAP })`.
4. **Draggable marker** at `currentLocation`.
5. **Events**
   - **`dragend`**: read marker position → `currentLocation` → **`reverseGeocode(currentLocation)`**.
   - **`click` on map**: move marker to click → **`reverseGeocode`**.

### 4.3 Geocoding flows

| Method | Role |
|--------|------|
| **`searchPlaces(query)`** | `geocoder.geocode({ address: query + ', India' })` → up to 5 results → `areaSearchResults` |
| **`selectArea(place)`** | Sets `personalInfo.area`, moves map/marker, **`populateAddressFields`** or fallback parser |
| **`reverseGeocode({lat,lng})`** | Sets `area` from first result + **`populateAddressFields`** |
| **`populateAddressFields(components)`** | Parses Google `address_components` into street, landmark, country, state, city, pincode (with **`setTimeout`** chains so state list / city list load before assignment) |
| **`populateAddressFieldsFallback(formattedAddress)`** | Splits comma-separated string when components missing |

### 4.4 UI states

- While map is loading, template can show spinner inside `.map-loading` until `this.map` is set (see HTML).
- Default center if GPS fails: **`currentLocation` = Bangalore** (`12.9716`, `77.5946`) in TS.

---

## 5. Identity Details — fields and behaviour

### 5.1 Identity type & number

- **Select** `idType`: Aadhaar (`adhaar`), Driving License, Voter ID, Passport.
- **`onIdentityTypeChange()`** (on change): clears `idNumber`, all preview URLs, certificate objects, file inputs, and `personalInfo.identity_image = {}`.

**Placeholder & max length** (template binds):

- `[placeholder]="getPlaceholder(idType)"`
- `[maxlength]="getMaxLength(idType)"`

| `idType` | Placeholder (example) | Max length |
|----------|----------------------|------------|
| `adhaar` | `xxxx-xxxx-xxxx` | 14 (formatted) |
| `driving_license` | TN-style example | 18 |
| `voterId` | Alphanumeric example | 10 |
| `passport` | Passport example | 9 |

### 5.2 `formatIdentity(event)` (live formatting)

Runs on **`(input)`** of identity number:

- **Aadhaar**: digits only, max 12, grouped as `xxxx-xxxx-xxxx`.
- **Others**: strip non-alphanumeric, uppercase, capped by type.
- Writes back to **`franchiserDetails.personalInfo.idNumber`**.

---

## 6. Identity upload — behaviour and API

### 6.1 UX layout (`identity-upload-section`)

- Wrapper: **`.identity-upload-section`** — light background, border, padding (`scss` ~lines 3697–3702).
- **Non-passport**: **`.identity-upload-grid-horizontal`** with two **`.identity-upload-item-horizontal`** blocks (Front, Back).
- **Passport**: same grid with class **`.single-upload`** — one slot.

Each slot contains:

1. **`.identity-upload-container-compact`** — clickable 50×50 “camera” tile; hidden **`<input type="file" class="upload-input">`** with `accept=".jpg,.jpeg,.png,.pdf"`.
2. **`.identity-upload-info-compact`** — title, subtitle (max size), optional **`.upload-error`**, optional **progress bar** (`isUploading`, `uploadProgress`).

### 6.2 Programmatic file open

- `uploadIdentityfront()` → `#identityImgfront-input`
- `uploadIdentityback()` → `#identityImgback-input`
- `uploadIdentitypass()` → `#identityImgpass-input`

Click on container triggers open only when no file yet (template guards e.g. `!identityfileFront && !isUploading['front']`).

### 6.3 Upload pipeline — `uploadidentityImage($event, type)`

`type` is `'front' | 'back' | 'passport'`.

1. **`validateFile(selectedFile, type)`** — size/type rules; toast on failure.
2. **`FormData`**: `append('files', file)`.
3. **Endpoint** (this app’s convention):
   - **PDF** → `franchiser/uploadfranchisedocument`
   - **Image** → `franchiser/uploadFileImages`
4. **Progress**: fake progress interval to ~90%, then 100% on success; `isUploading[type]`, `uploadProgress[type]`.
5. On success, normalizes response object with `date`, `time`, `mode`, `profilepic`.
6. Stores in:
   - **`identity_certificate_front` / `_back` / `_passport`** (full metadata)
   - **`identityfileFront` / `identityfileBack` / `identityfilePassport`** = image URL for `<img>` **or** `null` if PDF
   - **`isIdentityFrontPdf`** etc. from **`isPdfFile()`** (checks `originalname` / `filename` for `.pdf`)
7. Updates **`franchiserDetails.personalInfo.identity_image = { front, back, passport }`**.
8. Removes **field-error** class from the corresponding container if validation had marked it.

### 6.4 Delete — `deletefranchiserImage1(type)`

- Builds delete payload with file metadata and calls **`dataService.getfranchiserImagedelete`**.
- Clears TS state for that side and refreshes **`identity_image`** aggregate object.

### 6.5 Display rules

- **Image**: `<img [src]="identityfileFront" class="identity-img-compact">` — click opens modal (`viewProfileImage`).
- **PDF**: **`.pdf-display-compact`** with icon; click **`viewPDF(filepath)`** (no img src).

---

## 7. Supporting behaviours (cross-cutting)

| Function | Role |
|----------|------|
| **`remove_circls()`** | Removes error CSS from a fixed list of field ids (including area, country, idType, idNumber, etc.) |
| **`triggerAutoSave()`** | Debounced autosave pipeline (if you port, replace with your save API) |
| **`autoFillCompanyAddress()`** | When “company same as present” is enabled, copies present address into company fields |
| **`Math` in template** | Expose `Math` on component if template uses `Math.round(uploadProgress['front'])` |

---

## 8. SCSS — classes to copy for the same look

**Profile image (`profile-upload-section`)**

- `.profile-upload-section`, `.profile-image-container`, `.profile-upload-btn`, `.profile-image-display`, `.profile-img`
- `.profile-actions`, `.btn-action`, `.btn-delete` (and `.btn-view` if you add view-only actions)
- `.upload-info`, `.upload-title`, `.upload-subtitle`, `.upload-progress-container` / `.upload-progress-bar` / `.upload-progress-fill` / `.upload-progress-text`
- Error: `.profile-upload-btn.field-error`, `.profile-upload-section.field-error`, `.profile-image-display.field-error`

**Identity**

- `.identity-upload-section`, `.identity-upload-grid-horizontal`, `.identity-upload-grid-horizontal.single-upload`
- `.identity-upload-item-horizontal`, `.identity-upload-container-compact`, `.identity-camera-icon`
- `.identity-image-display-compact`, `.identity-img-compact`, `.identity-delete-icon-compact`
- `.identity-upload-info-compact`, `.identity-upload-title-compact`, `.identity-upload-subtitle-compact`
- `.identity-progress-container`, `.identity-progress-bar`, `.identity-progress-fill`, `.identity-progress-text`
- `.pdf-display-compact`, `.pdf-icon-compact`, `.pdf-label-compact`
- Error: `.identity-upload-container-compact.field-error`, `.identity-upload-section.field-error`

**Area search & map**

- `.area-search-container`, `.area-dropdown`, `.area-dropdown-item`
- `.map_label`, `.map_box`, `.map-loading`

**Hidden file input**

- `.upload-input` — typically `opacity: 0` / absolute positioning inside the tile (check full `.scss` for exact rules).

---

## 9. Porting checklist (another Angular app)

1. **Google Maps JavaScript API** loaded (same API key / loader strategy as your app). Without it, only **fallback** geolocation + mock search runs.
2. **Model**: map `personalInfo` fields (`profileimage`, address, identity) + optional explicit `lat`/`lng` on save from `currentLocation`.
3. **Lists**: implement or stub **`getState`**, **`getCityList`** (and backend matching `cityList` for ngx-select).
4. **Uploads**: replace `franchiser/uploadFileImages` and `franchiser/uploadfranchisedocument` + **`getfranchiserImagedelete`** with your APIs; keep the **PDF vs image** split if your backend requires it.
5. **Profile preview**: wire **`filepath`** / **`certificate`** (or your equivalents) and an image modal / PDF viewer like **`viewProfileImage`** / **`viewPDF`**.
6. **Template**: copy HTML blocks + SCSS classes; add `FormsModule`, **ngx-select** module if you keep `ngx-select`.
7. **Validation**: replicate `validateFile` limits (e.g. 2MB per subtitle in UI).
8. **Accessibility**: consider `aria-label`s on map and upload tiles when reusing.

---

## 10. Quick reference — key TypeScript symbols

| Symbol | File (approx.) |
|--------|----------------|
| `uploadfile`, `uploadImage(..., 'profile')`, `deletefranchiserImage(1, certificate)` | `franchiser-register.component.ts` |
| `loadGoogleMaps`, `initializeMap`, `initializeFallbackMap` | same |
| `getCurrentLocation`, `reverseGeocode`, `populateAddressFields` | same |
| `onAreaSearch`, `searchPlaces`, `selectArea`, `hideAreaDropdown` | same |
| `onIdentityTypeChange`, `getPlaceholder`, `getMaxLength`, `formatIdentity` | same |
| `uploadidentityImage`, `deletefranchiserImage1`, `isPdfFile`, `updatePdfFlags` | same |
| `validateFile`, `findElementToHighlight`, `hideFieldErrorMessage` | same |

---

*Generated from the `healthcare_onboard` codebase structure as of the documentation date; line numbers may shift as the repo evolves.*
