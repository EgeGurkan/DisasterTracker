# MapSpy 🗺️

MapSpy is an **independent, experimental map and navigation interface** developed for learning, prototyping, and demonstration. It displays maps, routes, points of interest, and various traffic-related entries. It is not an official navigation, public safety, or traffic enforcement service.

> **Important:** Information shown in MapSpy may be approximate, outdated, unverified, or illustrative. Always follow traffic laws and official road signs. This project does not provide verified, real-time law-enforcement or road-safety information.

> https://egegurkan.github.io/DisasterTracker/

## 📌 About the Project

- **AI-assisted development:** The project was built as an experiment with assistance from Google Gemini. AI-generated output, like any other code, should be reviewed and tested before reuse.
- **Data and source limitations:** The application includes entries embedded directly in its code and may access publicly available information or third-party services. The accuracy, provenance, current status, and reuse permissions of individual entries have not all been independently verified.
- **Educational purpose:** This is a hobby and demonstration project, not a government or commercial service. Its educational nature does not remove obligations under applicable law or third-party terms.
- **No official affiliation:** Names such as EGM or KGM, where displayed, identify categories or purported sources of information; their appearance does not prove an official data connection, approval, or endorsement.

## 🛠️ How It Works

- MapSpy is a browser-based interface distributed in `index.html` and `MapSpy.html`.
- It uses **Leaflet.js** to display map layers, as well as third-party libraries and services for map tiles, routing, place searches, and other features.
- Some map layers in the current implementation request images directly from Google-hosted tile endpoints. **Technical access does not establish permission to use those endpoints.** Their use should be reviewed against Google's applicable terms and replaced with an authorized integration where necessary.
- Other external services may include OpenStreetMap-based tile and search providers, OSRM routing, and external map links. Each provider's terms, rate limits, attribution requirements, and privacy notices apply independently.
- Loading external maps, search results, or routes requires an internet connection. Browser security restrictions may affect location access when the page is opened as a local file.

## 🗂️ Data Quality and Attribution

- Radar, camera, speed-corridor, facility, and other map entries are **not guaranteed** to be complete, verified, current, or officially published.
- Labels referring to public bodies, services, or community platforms must not be interpreted as proof that those bodies or platforms supplied or approved the data.
- Public accessibility is not equivalent to an open license. Before republishing, exporting, distributing, or commercially reusing any dataset or map imagery, verify the source and applicable permissions.
- Where required, keep the original provider's attribution and copyright notices visible.

## ⚠️ Legal Notice and Disclaimer

### 1. Informational and Experimental Use

MapSpy is an independent project created for educational and demonstration purposes. It is not an official traffic-monitoring, law-enforcement, emergency-response, or navigation authority.

### 2. Accuracy, Currency, and Reliability

Displayed information, including routes, speed corridors, camera and radar entries, points of interest, prices, and map layers, may be inaccurate, incomplete, approximate, illustrative, unavailable, or outdated. MapSpy does not claim to offer verified, comprehensive, or real-time official traffic enforcement data. Do not rely on it for safety-critical decisions.

### 3. Lawful and Safe Use

Users must obey applicable traffic laws, posted speed limits, road signs, and lawful instructions from authorities. The project does not encourage unsafe driving or evasion of lawful enforcement. Responsibility for developing, distributing, and using the project is determined by applicable law; this notice does not automatically transfer all legal responsibility to users.

### 4. Independence from Public Authorities

MapSpy is not affiliated with, sponsored by, endorsed by, or officially approved by the Republic of Türkiye, the General Directorate of Security (EGM), the General Directorate of Highways (KGM), or any other government institution. References to such institutions are informational only.

### 5. Third-Party Content, Licenses, and Service Terms

MapSpy may display or access third-party maps, datasets, software libraries, search and geocoding tools, routing services, or other content. Their use remains subject to the relevant copyright, trademark, attribution, license, API, access, and usage requirements. **Publicly accessible content is not necessarily free to copy, republish, or use without restrictions.** Access to an external map tile endpoint does not in itself establish authorization to use that service.

### 6. Location and Privacy

Location-related features may request the user's permission through the browser. External map, geocoding, routing, weather, or other services may receive technical request information such as IP addresses, coordinates, routes, or search terms. Some settings or data may also be stored locally in the browser. Users should review relevant provider privacy policies and avoid submitting other people's personal information without an appropriate legal basis. Anyone publicly deploying or further developing this project should assess applicable privacy and data-protection obligations.

### 7. Warranties and Liability

The software is supplied **"AS IS"**, without warranties to the extent permitted by applicable law. Its educational purpose and any warranty or liability disclaimer do not eliminate non-waivable legal obligations or third-party rights. No statement here constitutes advance rejection of a legitimate copyright, privacy, trademark, data-protection, or other legal claim.

### 8. Corrections and Rights Holder Requests

If you find a factual error, missing attribution, problematic entry, or potential legal or privacy concern, please open an issue in this GitHub repository with relevant details so it can be reviewed.

**This notice is informational and does not constitute legal advice.**

## 📜 License

The original code for this repository is made available under the **MIT License**, subject to the terms in the separate [`LICENSE`](LICENSE) file.

This license applies only to material that the repository's contributors have the right to license. It does **not** grant permission to use third-party map imagery, geospatial datasets, names, trademarks, icons, APIs, or external services contrary to their respective licenses or terms. Embedded or externally loaded third-party components retain their own applicable notices and licensing requirements.
