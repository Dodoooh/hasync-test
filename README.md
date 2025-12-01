# HAsync - Home Assistant Manager

✅ **WORKING v1.3.7** - Clean API documentation with only existing endpoints

Advanced Home Assistant management interface with client pairing and entity synchronization.

## Installation

Add this repository to Home Assistant via **Settings** > **Add-ons** > **Add-on Store** > **⋮** > **Repositories**:

```txt
https://github.com/Dodoooh/hasync-test
```

## Add-ons

This repository contains the following add-ons

### [HAsync Manager](./example)

![Supports amd64 Architecture][amd64-shield]
![Supports i386 Architecture][i386-shield]

_Advanced Home Assistant management interface_

## Development Status

✅ **Step 1**: Name changed to HAsync
✅ **Step 2**: Dockerfile updated with Node.js, npm, TypeScript support
✅ **Step 2c**: Removed pre-built image reference
🔄 **Step 3a**: Added HAsync run.sh startup script (v1.0.3)
⏳ **Step 3b**: Will add app files next

<!--

Notes to developers after forking or using the github template feature:
- While developing comment out the 'image' key from 'example/config.yaml' to make the supervisor build the addon
  - Remember to put this back when pushing up your changes.
- When you merge to the 'main' branch of your repository a new build will be triggered.
  - Make sure you adjust the 'version' key in 'example/config.yaml' when you do that.
  - Make sure you update 'example/CHANGELOG.md' when you do that.
  - The first time this runs you might need to adjust the image configuration on github container registry to make it public
  - You may also need to adjust the github Actions configuration (Settings > Actions > General > Workflow > Read & Write)
- Adjust the 'image' key in 'example/config.yaml' so it points to your username instead of 'home-assistant'.
  - This is where the build images will be published to.
- Rename the example directory.
  - The 'slug' key in 'example/config.yaml' should match the directory name.
- Adjust all keys/url's that points to 'home-assistant' to now point to your user/fork.
- Share your repository on the forums https://community.home-assistant.io/c/projects/9
- Do awesome stuff!
 -->

[aarch64-shield]: https://img.shields.io/badge/aarch64-yes-green.svg
[amd64-shield]: https://img.shields.io/badge/amd64-yes-green.svg
[armhf-shield]: https://img.shields.io/badge/armhf-yes-green.svg
[armv7-shield]: https://img.shields.io/badge/armv7-yes-green.svg
[i386-shield]: https://img.shields.io/badge/i386-yes-green.svg
