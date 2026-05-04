# Company Information — Company Details, Company Address, Legal & Registration

This document describes the **Company Information** section in `src/app/franchiser-register` (Angular), focusing on:

1. **Company Details**
2. **Company Address** (with “same as personal address” + map + area search + state/city dropdowns)
3. **Legal & Registration** (COI / Business Structure / GSTIN / PAN with certificate uploads)

It’s written so you can reuse the same functionality in a new component/project.

## Primary source files

| Area | File |
|------|------|
| Template | `franchiser-register.component.html` — “Company Information” card |
| Logic | `franchiser-register.component.ts` — address map, dropdown handlers, upload handlers |
| Styles | `franchiser-register.component.scss` — shared `identity-upload-section`, map + area dropdown styles |
| Dropdown API methods | `src/app/data.service.ts` — `getStatelist()` and `getcities()` |

## 1. Data model (field names you bind)

Company information lives mostly inside `franchiserDetails.companyInfo` and a few “legal” fields on `franchiserDetails`.

### 1.1 Company Details (companyInfo + some top-level fields)

| Field | Location | Meaning |
|---|---|---|
| `companyName` | `franchiserDetails.companyInfo.companyName` | Company/Franchise name |
| `companyemail` | `franchiserDetails.companyInfo.companyemail` | Company email |
| `companymobile_number` | `franchiserDetails.companyInfo.companymobile_number` | Company mobile |
| `businessWebsite` | `franchiserDetails.businessWebsite` | Business website (URL) |
| `businessStructure` | `franchiserDetails.businessStructure` | Dropdown: Sole Prop / Partnership / Pvt Ltd / etc. |

### 1.2 Company Address (companyInfo.*)

| Field | Location | Meaning |
|---|---|---|
| `sameaddress` | `franchiserDetails.companyInfo.sameaddress` | `"Yes"` or `"No"` for “Same as personal address” |
| `companyarea` | `franchiserDetails.companyInfo.companyarea` | “Select Area” formatted address |
| `doorno` | `franchiserDetails.companyInfo.doorno` | Door number |
| `street` | `franchiserDetails.companyInfo.street` | Street (required when sameaddress = `No`) |
| `landmark` | `franchiserDetails.companyInfo.landmark` | Landmark |
| `companycountry` | `franchiserDetails.companyInfo.companycountry` | Country code (UI uses `IN`) |
| `companystate` | `franchiserDetails.companyInfo.companystate` | State name |
| `companycity` | `franchiserDetails.companyInfo.companycity` | City (ngx-select) |
| `companypincode` | `franchiserDetails.companyInfo.companypincode` | Pincode |

### 1.3 Legal & Registration fields

| Field | Location | Meaning |
|---|---|---|
| `coiNumber` | `franchiserDetails.coiNumber` | COI (Certificate of Incorporation) number |
| `dateofestablishment` | `franchiserDetails.dateofestablishment` | Establishment date |
| `coi_certificate` | `franchiserDetails.coi_certificate` | Uploaded COI certificate file object |
| `gstinNumber` | `franchiserDetails.gstinNumber` | GSTIN number |
| `gstin_certificate` | `franchiserDetails.gstin_certificate` | Uploaded GSTIN certificate file object |
| `companypanNumber` | `franchiserDetails.companypanNumber` | PAN number |
| `companypan_image` | `franchiserDetails.companypan_image` | Uploaded PAN image/PDF file object |

## 2. Company Details

In `franchiser-register.component.html`, “Company Details” is the part inside the Company Information card that contains:

### 2.1 Company/Franchise Name

- Bound to: `franchiserDetails.companyInfo.companyName`
- Uses:
  - `(input)` / `(ngModelChange)` → `remove_circls(); triggerAutoSave()`
  - `(blur)` / `(change)` → `triggerAutoSave()` and `(change)="setfranchise()"`.
- Sanitization: `(input)="onNameInput($event)"`
- `setfranchise()` updates:
  - `franchiserDetails.franchise = { id: '', name: franchiserDetails.companyInfo.companyName }`

### 2.2 Company Email

- Bound to: `franchiserDetails.companyInfo.companyemail`
- Uses:
  - `(input)="onEmailInput($event)"`
  - `(blur)="triggerAutoSave()"`
  - `(ngModelChange)="remove_circls(); triggerAutoSave()"`

### 2.3 Company Mobile Number

- Bound to: `franchiserDetails.companyInfo.companymobile_number`
- UI shows `+91` prefix in an input group.
- Uses:
  - `(input)="onCompanyMobileInput($event)"`
  - `maxlength="10"`
  - `(blur)="triggerAutoSave()"`
  - `(ngModelChange)="remove_circls(); triggerAutoSave()"`

### 2.4 Business Website

- Bound to: `franchiserDetails.businessWebsite`
- Input type: `url`
- Uses `(blur)="triggerAutoSave()"` and `remove_circls(); triggerAutoSave()` on change.

## 3. Company Address (Same-as toggle, Map, Area search, State/City dropdowns)

The address UI is controlled by:

`franchiserDetails.companyInfo.sameaddress` (`"Yes"` or `"No"`)

### 3.1 “Same as above Personal address” toggle

- HTML radio buttons set `sameaddress` via:
  - `(change)="changesameaddressStatus($event)"`
- When selecting:
  - **`Yes`**:
    - Copies all address fields from `franchiserDetails.personalInfo` into `franchiserDetails.companyInfo`
    - Sets `isDisabled = 'Yes'`
    - Clears interactive company map and initializes readonly map (`initializeReadonlyCompanyMap()`).
  - **`No`**:
    - Sets `sameaddress = 'No'`
    - Resets company address fields to `null`
    - Sets `isDisabled = 'No'`
    - Clears readonly map and initializes interactive company map (`initializeCompanyMap()`).

### 3.2 Interactive Company Address UI (sameaddress = `No`)

Shown in the template under:

`*ngIf="franchiserDetails?.companyInfo?.sameaddress == 'No'"`

#### (A) “Select Area” with dropdown search

- Input bound to: `franchiserDetails.companyInfo.companyarea`
- Events:
  - `(input)="onCompanyAreaSearch($event)"`
  - `(blur)="hideCompanyAreaDropdown()"`
  - `(ngModelChange)="remove_circls()"`
  - Crosshair UI is decorative (map is updated on selection + reverse geocode).

Dropdown items:

- `*ngIf="showCompanyAreaDropdown && companyAreaSearchResults.length > 0"`
- Each dropdown item calls:
  - `(mousedown)="selectCompanyArea(result)"`

#### (B) Door / Street / Landmark

- Door: `companyInfo.doorno`
- Street: `companyInfo.street` (label shows required `*`)
- Landmark: `companyInfo.landmark`
- All use `onTextInput($event)` and `remove_circls()` on change.

#### (C) Country & State dropdowns

- Country select:
  - `[(ngModel)]="franchiserDetails.companyInfo.companycountry"`
  - `(change)="getCompanyState()"`
  - UI default option: “Select Country” + “India (IN)”
- State select:
  - `[(ngModel)]="franchiserDetails.companyInfo.companystate"`
  - `(change)="getCompanyCityList()"`
  - Options come from `CompanystateList`

#### (D) City dropdown (ngx-select) + Pincode

- City uses `ngx-select`:
  - `[items]="CompanycityList"`
  - `[(ngModel)]="franchiserDetails.companyInfo.companycity"`
- Pincode is a text input:
  - `companyInfo.companypincode`
  - `(input)="onCompanyPincodeInput($event)"`
  - `maxlength="6"`

### 3.3 Readonly Company Address UI (sameaddress = `Yes`)

Shown under:

`*ngIf="franchiserDetails?.companyInfo?.sameaddress == 'Yes'"`

What changes in readonly mode:

- “Select Area” becomes readonly:
  - input uses `readonly` and `companyarea` (displayed in `companyarea`)
- Door / Street / Landmark become `readonly` inputs
- Country/State become disabled selects
- City and Pincode become `readonly` text inputs
- Company map becomes non-interactive:
  - template shows a `#companyMapReadonly` container with `pointer-events: none`
  - populated by `initializeReadonlyCompanyMap()`

## 4. Company Address Map behavior (Google Maps)

### 4.1 Map initialization lifecycle

- `ngAfterViewInit()` decides which map to initialize:
  - If `sameaddress === 'Yes'` → `initializeReadonlyCompanyMap()`
  - Else → `initializeCompanyMap()`

### 4.2 Interactive map (sameaddress = `No`)

`initializeCompanyMap()`:

- Creates:
  - `companyMap = new google.maps.Map(document.getElementById('companyMap'), ...)`
  - `companyMarker` as a **draggable** marker
- Marker events:
  - `dragend`:
    - updates `companyCurrentLocation`
    - calls `reverseGeocodeCompany(companyCurrentLocation)`
  - map `click`:
    - moves marker
    - calls `reverseGeocodeCompany(location)`

`reverseGeocodeCompany(location)`:

- Uses `geocoder.geocode({ location }, ...)`
- On success:
  - sets `companyInfo.companyarea = formatted_address`
  - calls `populateCompanyAddressFields(address_components)` to fill:
    - `street`, `landmark`, `companycountry`, `companystate`, `companycity`, `companypincode`

Fallback:

- If Google Maps isn’t available:
  - `initializeCompanyMapFallback()` renders a placeholder in `#companyMap`

### 4.3 Readonly map (sameaddress = `Yes`)

`initializeReadonlyCompanyMap()`:

- Creates a Google map in `#companyMapReadonly` with:
  - `gestureHandling: 'none'`, disabled UI controls
  - marker is set to `currentLocation` (personal address location)

If Google Maps is unavailable:

- It renders a simple message:
  - “Same as Personal Address”

## 5. Company Address dropdown API endpoints

Country → State → City dropdowns are driven by `DataService` methods.

### 5.1 State list API

`getCompanyState()` calls:

- `dataService.getStatelist(franchiserDetails.companyInfo.companycountry)`

In `data.service.ts`:

- `getStatelist(state)`:
  - `GET {baseURL}/user/getstate/{state}`

### 5.2 City list API

`getCompanyCityList()` calls:

- `dataService.getcities(\`IN/${franchiserDetails.companyInfo.companystate}\`)`

In `data.service.ts`:

- `getcities(body)`:
  - `GET {baseURL}/user/getcities/{body}`

So city URL pattern is:

- `.../user/getcities/IN/{stateName}`

## 6. Legal & Registration

In the company information card, “Legal & Registration” includes:

1. COI number + establishment date + COI certificate upload
2. Business structure dropdown
3. GSTIN number + GSTIN certificate upload
4. PAN number + PAN image/PDF upload

### 6.1 COI (Certificate of Incorporation)

#### (A) COI Number

- Bound to: `franchiserDetails.coiNumber`
- Input type: text
- Sanitization via `(input)="onTextInput($event)"`
- Auto-save via `(ngModelChange)="remove_circls(); triggerAutoSave()"`

#### (B) Date Of Establishment

- Bound to: `franchiserDetails.dateofestablishment`
- Input type: date
- UI uses `[max]="today"` so future dates are blocked by the date input.
- Additional validation:
  - `(change)="validateEstablishmentDate($event); triggerAutoSave()"`
  - `(blur)="validateEstablishmentDate($event)"`
- `validateEstablishmentDate()`:
  - clears the date if selectedDate is in the future
  - sets `errorFields['does'] = true` and adds `input-error` CSS

#### (C) COI Certificate upload UI

- Uses the shared **`identity-upload-section`** “single upload” design.
- Hidden file input triggers via `rocuploadfile()`.
- Upload handler: `(change)="roc_uploadImage($event)"`
- Display rules:
  - If `rocfilepath` exists and file is not a PDF → show `<img>`
  - If `isRocCertificatePdf` → show PDF tile and call `viewPDF(roc_certificate.filepath)`

**Upload logic (`roc_uploadImage`)**

- Validates file via `validateFile(selectedFile, 'roc')` (2MB limit, allowed image/pdf types)
- Upload endpoint is based on extension:
  - PDF → `franchiser/uploadfranchisedocument`
  - Image → `franchiser/uploadFileImages`
- Stores result:
  - `roc_certificate = res.data`
  - `franchiserDetails.coi_certificate = roc_certificate`
  - `rocfilepath = null` when PDF

### 6.2 Business Structure dropdown

- Bound to: `franchiserDetails.businessStructure`
- `<select>` options include:
  - Sole Proprietorship, Partnership, Private Limited Company, Public Limited Company, LLP, One Person Company, Franchise
- Validation requirement:
  - `validateCompanyInfo()` treats it as required (missing adds `bstr` to missing fields).

### 6.3 GSTIN (optional in validateCompanyInfo)

#### (A) GSTIN Number

- Bound to: `franchiserDetails.gstinNumber`
- Input type: text
- Sanitization via `(input)="onTextInput($event)"`

#### (B) GSTIN Certificate upload

- UI uses `identity-upload-section` single-upload for GSTIN certificate.
- Trigger: `gstinuploadfile()` → clicks hidden input `gstin_customFileEg1`
- Handler: `(change)="uploadImage($event, 'gstin')"`
- Upload logic for `type == 'gstin'`:
  - validates with `validateFile(selectedFile, 'gstin')`
  - endpoint is selected via file extension:
    - `getUploadApiEndpoint(file)`:
      - PDF → `franchiser/uploadfranchisedocument`
      - Image → `franchiser/uploadFileImages`
  - stores:
    - `gstin_certificate` and `gstinfilepath`
    - `franchiserDetails.gstin_certificate = gstin_certificate`

### 6.4 PAN (Company PAN — required in validateCompanyInfo)

#### (A) PAN Number

- Bound to: `franchiserDetails.companypanNumber`
- Input type: text
- maxlength: 10

#### (B) PAN image/PDF upload

- UI uses `identity-upload-section` single-upload.
- Trigger: `panuploadfile()` (clicks hidden input `pan_customFileEg1-input`)
- Handler: `(change)="uploadImage($event, 'pan')"`
- Upload logic for `type == 'pan'`:
  - validates with `validateFile(selectedFile, 'pan')`
  - endpoint depends on file extension:
    - PDF → `franchiser/uploadfranchisedocument`
    - Image → `franchiser/uploadFileImages`
  - stores:
    - `companypan_image`, `panfilepath`, `isPanImagePdf`
    - `franchiserDetails.companypan_image = companypan_image`

## 7. Required vs Optional (based on `validateCompanyInfo()`)

`validateCompanyInfo()` currently checks these required fields:

- `companyName` (`companyName`)
- `companyemail` (`companyemail`)
- `companymobile_number` (`companymobile_number`)
- `dateofestablishment` (`does`)
- `coi_certificate` (checked by: `franchiserDetails.coi_certificate`, missing → `roc_customFileEg1`)
- `businessStructure` (`bstr`)
- `companypanNumber` (`panNumber`)
- `companypan_image` (missing → `pan_customFileEg1`)

Not checked as required there:
- `gstinNumber` / `gstin_certificate` (can be treated as optional unless your backend requires it)

## 8. Certificate upload design classes you can reuse

All document/certificate uploads in this section use the same shared UI blocks (from the Identity upload section styles):

- `.identity-upload-section`
- `.identity-upload-grid-horizontal`
- `.identity-upload-grid-horizontal.single-upload`
- `.identity-upload-item-horizontal`
- `.identity-upload-container-compact`
- `.identity-camera-icon`
- `.identity-image-display-compact`
- `.identity-img-compact`
- `.identity-delete-icon-compact`
- `.identity-upload-info-compact`
- `.identity-upload-title-compact`
- `.identity-upload-subtitle-compact`
- `.identity-progress-container` / `.identity-progress-bar` / `.identity-progress-fill` / `.identity-progress-text`
- PDF tile classes:
  - `.pdf-display-compact`, `.pdf-icon-compact`, `.pdf-label-compact`

Error state:
- `.identity-upload-container-compact.field-error`
- `.identity-upload-section.field-error`

## 9. API summary (just the ones used here)

- State list:
  - `DataService.getStatelist(state)` → `GET .../user/getstate/{state}`
- City list:
  - `DataService.getcities(body)` → `GET .../user/getcities/{body}`
  - For company: `body = IN/{companystate}`
- File uploads:
  - COI / GSTIN / PAN certificate upload uses the same pattern:
    - PDF → `franchiser/uploadfranchisedocument`
    - Image → `franchiser/uploadFileImages`
- Delete uploaded files:
  - `deletefranchiserImage(val, file)` where:
    - `val == 3` → COI certificate (`roc_customFileEg1`)
    - `val == 5` → GSTIN certificate (`gstin_customFileEg1`)
    - `val == 6` → PAN certificate (`pan_customFileEg1`)

