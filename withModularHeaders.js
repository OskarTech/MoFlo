const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let podfile = fs.readFileSync(podfilePath, 'utf8');

      const modularHeadersPods = `
  pod 'GoogleUtilities', :modular_headers => true
  pod 'FirebaseCore', :modular_headers => true
  pod 'FirebaseAuth', :modular_headers => true
  pod 'FirebaseAuthInterop', :modular_headers => true
  pod 'FirebaseAppCheckInterop', :modular_headers => true
  pod 'FirebaseFirestoreInternal', :modular_headers => true
  pod 'FirebaseCoreInternal', :modular_headers => true
  pod 'FirebaseCoreExtension', :modular_headers => true
  pod 'FirebaseStorage', :modular_headers => true
  pod 'RecaptchaInterop', :modular_headers => true
  pod 'abseil', :modular_headers => true
`;

      if (!podfile.includes("pod 'GoogleUtilities', :modular_headers => true")) {
        podfile = podfile.replace('  post_install do |installer|', modularHeadersPods + '  post_install do |installer|');
        fs.writeFileSync(podfilePath, podfile);
      }

      return config;
    },
  ]);
};
