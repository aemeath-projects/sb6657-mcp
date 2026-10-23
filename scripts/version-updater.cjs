const VERSION_PATTERN = /(export const SERVER_VERSION = ')([^']+)(')/

exports.readVersion = function (contents) {
  const match = VERSION_PATTERN.exec(contents)
  return match ? match[2] : null
}

exports.writeVersion = function (contents, version) {
  return contents.replace(VERSION_PATTERN, `$1${version}$3`)
}
