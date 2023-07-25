import fs from 'fs'
import zlib from 'zlib'
import http from 'http'
import https from 'https'
import crypto from 'crypto'

if (!fs.existsSync('./mdrdownload.json')) {
  fs.writeFileSync('./mdrdownload.json', '{"data":{},"lastID":2853}')
}

if (!fs.existsSync('./firmware/')) {
  fs.mkdirSync('./firmware/')
}

const options: Options = JSON.parse(fs.readFileSync('./mdrdownload.json').toString())

const MIN = options.lastID
const LAST = options.lastID === 2853 ? 100 : 10
  ;
(async () => {
  // 更新最新固件
  // Update the latest firmware
  if (options.data !== undefined) {
    for (const serviceID in options.data) {
      await getInfo(options.data[serviceID].category, serviceID)
    }
  }
  // 扫描新ID, 初次扫描110个, 后续20个
  // Scan new ID, scan 110 for the first time, and 20 later
  for (let categoryID = 1; categoryID < 3; categoryID++) {
    for (let serviceID = MIN - 10; serviceID < MIN + LAST; serviceID++) {
      if ((categoryID === 1 && serviceID > 2942) || (categoryID === 2 && serviceID < 2943) || serviceID in options.data) {
        continue
      }
      const category = `HP00${categoryID}`
      await getInfo(category, serviceID.toString())
    }
  }
})()
/**
 * 保存mdrdownload.json
 *
 */
function saveOptions() {
  fs.writeFileSync('./mdrdownload.json', JSON.stringify(options, undefined, 2))
}
/**
 * webGet
 *
 * @param {string} url
 * @returns {(Promise<Buffer | undefined>)}
 */
function webGet(url: string): Promise<Buffer | undefined> {
  return new Promise<Buffer | undefined>((resolve, _reject) => {
    let web: typeof https | typeof http
    if (url.startsWith('https')) {
      web = https
    }
    else {
      web = http
    }
    web.get(url, {
      headers: {
        'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 11; XQ-AT52 Build/58.1.A.5.159)',
        'Accept-Encoding': 'gzip'
      }
    },
      res => {
        let cRes: http.IncomingMessage | zlib.Gunzip | zlib.Inflate
        const rawData: Buffer[] = []
        switch (res.headers['content-encoding']) {
          case 'gzip':
            cRes = res.pipe(zlib.createGunzip())
            break
          case 'deflate':
            cRes = res.pipe(zlib.createInflate())
            break
          default:
            cRes = res
            break
        }
        cRes
          .on('data', (chunk: Buffer) => rawData.push(chunk))
          .on('end', () => {
            const data = Buffer.concat(rawData)
            if (res.statusCode !== 200) {
              console.error('服务器错误, Server error', res.statusCode, data.toString())
              resolve(undefined)
            }
            resolve(data)
          })
          .on('error', e => {
            console.error('数据接收错误, Data receiving error', e)
            resolve(undefined)
          })
      })
      .on('error', e => {
        console.error('请求错误, Request error', e)
        resolve(undefined)
      })
  })
}
/**
 * 获取并解析info.xml
 *
 * @param {string} category
 * @param {string} serviceID
 */
async function getInfo(category: string, serviceID: string) {
  // 目前只观察到MDRID有0-3
  // Currently only MDRID 0-3 is observed
  for (let i = 0; i <= 3; i++) {
    const service = `MDRID${serviceID}0${i}`
    const data = await webGet(`https://info.update.sony.net/${category}/${service}/info/info.xml`)
    if (data === undefined) {
      console.error('数据获取错误, Error getting data', category, service)
      continue
    }
    // 分割数据
    // Split data
    const headerLength = data.indexOf('\n\n')
    // 头部数据
    // Header data
    const header = data.slice(0, headerLength).toString()
    // 解析头部
    // Parse header
    const headerSplit = header.match(/eaid:(?<eaid>.*)\ndaid:(?<daid>.*)\ndigest:(?<digest>.*)/)
    if (headerSplit === null) {
      console.error('数据头错误, Data header error', header)
      continue
    }
    const { eaid, daid, digest } = <{ [key: string]: string }>headerSplit.groups
    let enc = ''
    switch (eaid.toUpperCase()) {
      case 'ENC0001':
        enc = 'none'
        break
      case 'ENC0002':
        enc = 'des-ede3'
        break
      case 'ENC0003':
        enc = 'aes-128-ecb'
        break
      default:
        break
    }
    let has = ''
    switch (daid.toUpperCase()) {
      case 'HAS0001':
        has = 'none'
        break
      case 'HAS0002':
        has = 'md5'
        break
      case 'HAS0003':
        has = 'sha1'
        break
      default:
        break
    }
    if (enc === '' || has === '') {
      console.error('加密信息错误, Encryption information error', header)
      continue
    }
    // xml数据
    // xml data
    const cryptedData = data.slice(headerLength + 2)
    let decryptedData = ''
    if (enc === 'none') {
      decryptedData = cryptedData.toString()
    }
    else {
      if (enc === 'des-ede3') {
        decryptedData = DESdecipher(cryptedData)
      }
      else {
        decryptedData = AESdecipher(cryptedData)
      }
    }
    // 数据校验
    // Data verification
    if (has !== 'none') {
      const dataHash = gethash(has, decryptedData)
      const hash = gethash(has, dataHash + service + category)
      if (hash !== digest) {
        decryptedData = AESdecipher(cryptedData, true)
        const dataHashGM = gethash(has, decryptedData)
        const hashGM = gethash(has, dataHashGM + service + category)
        if (hashGM !== digest) {
          console.error('数据校验错误, Data validation error', header)
          continue
        }
      }
    }
    // 某些情况下会出现乱码
    // In some cases, garbled code may appear
    if (!isXML(decryptedData)) {
      console.error('XML数据错误, XML data error', header)
      continue
    }
    // 下载固件
    // Download firmware
    await getFirmware(decryptedData, category, service, serviceID)
  }
}
/**
 * DESdecipher
 *
 * @param {Buffer} cryptedData
 * @returns {string}
 */
function DESdecipher(cryptedData: Buffer): string {
  const keyBuffer = Buffer.alloc(24)
  const decipher = crypto.createDecipheriv('des-ede3', keyBuffer, '')
  decipher.setAutoPadding(false)
  return Buffer.concat([decipher.update(cryptedData), decipher.final()]).toString()
}
/**
 * AESdecipher
 *
 * @param {Buffer} cryptedData
 * @param {boolean} [GM=false]
 * @returns {string}
 */
function AESdecipher(cryptedData: Buffer, GM = false): string {
  let keyBuffer: Buffer
  // 似乎是PC上用的, 不知道为什么出现在这里
  // It seems to be used on PC, don't know why it appears here
  if (GM) {
    keyBuffer = Buffer.from('73e84a54d05837a8acdc5d9e2d652b97', 'hex')
  }
  else {
    keyBuffer = Buffer.from('4fa27999ffd08b1fe4d260d57b6d3c17', 'hex')
  }
  const decipher = crypto.createDecipheriv('aes-128-ecb', keyBuffer, '')
  decipher.setAutoPadding(false)
  return Buffer.concat([decipher.update(cryptedData), decipher.final()]).toString()
}
/**
 * gethash
 *
 * @param {string} algorithm
 * @param {(Buffer | string)} data
 * @returns {string}
 */
function gethash(algorithm: string, data: Buffer | string): string {
  return crypto.createHash(algorithm).update(data).digest('hex')
}
/**
 * isXML
 *
 * @param {string} xml
 * @returns {boolean}
 */
function isXML(xml: string): boolean {
  if (xml.startsWith('<?xml')) {
    return true
  }
  else {
    return false
  }
}
/**
 * 下载固件
 * Download firmware
 *
 * @param {string} infoData
 * @param {string} category
 * @param {string} service
 * @param {string} serviceID
 */
async function getFirmware(infoData: string, category: string, service: string, serviceID: string) {
  // 解析数据, 一般只有一个
  // Parse data, usually only one
  // 打脸了, 修一下
  const infosRegex = /\<Distribution ID="FW".*MAC="(?<mac>[^"]*)".*URI="(?<url>[^"]*)".*\/\>/g
  let infoMatch: RegExpExecArray | null
  // 循环获取固件信息
  // Loop to get firmware information
  while ((infoMatch = infosRegex.exec(infoData)) !== null) {
    const { mac, url } = <{ [key: string]: string }>infoMatch.groups

    const fileNameRegex = url.match(/\/([^\/]*)\.(\w{3})$/)
    if (fileNameRegex === null) {
      console.error('解析文件名错误, Error parsing file name', service, url)
      continue
    }
    const fileName = fileNameRegex[1]
    const extName = fileNameRegex[2]
    // 查找是否已经下载
    // Find out if it has been downloaded
    if (options.data[serviceID]?.services[service]?.includes(mac)) {
      console.error('已是最新, Already up to date', service, mac)
      continue
    }
    // 是否与其他区域固件相同
    // Whether it is the same as the firmware in other regions
    else {
      let same = false
      for (const service2 in options.data[serviceID]?.services) {
        if (options.data[serviceID].services[service2].includes(mac)) {
          console.error(`与 ${service2} 相同, Same as ${service2}`, service, mac)
          if (!fs.existsSync(`./firmware/${serviceID}/${service}`)) {
            fs.mkdirSync(`./firmware/${serviceID}/${service}`)
          }
          fs.writeFileSync(`./firmware/${serviceID}/${service}/${fileName}.sameas${service2}.${mac}.${extName}`, fileName)
          if (options.data[serviceID].services[service] === undefined) {
            options.data[serviceID].services[service] = [mac]
          }
          else {
            options.data[serviceID].services[service].push(mac)
          }
          same = true
          break
        }
      }
      if (same) {
        continue
      }
    }
    // 下载固件
    // Download firmware
    const fw = await webGet(url)
    if (fw === undefined) {
      console.error('下载固件错误, Error downloading firmware', service, url)
      continue
    }
    const fwSHA1 = crypto.createHash('SHA1').update(fw).digest('hex')
    if (fwSHA1 !== mac) {
      console.error('固件SHA1错误, Firmware SHA1 error', service, mac)
      continue
    }
    if (!fs.existsSync(`./firmware/${serviceID}/`)) {
      fs.mkdirSync(`./firmware/${serviceID}/`)
    }
    if (!fs.existsSync(`./firmware/${serviceID}/${service}`)) {
      fs.mkdirSync(`./firmware/${serviceID}/${service}`)
    }
    fs.writeFileSync(`./firmware/${serviceID}/${service}/${fileName}.${mac}.${extName}`, fw)
    if (options.data[serviceID] === undefined) {
      const lastID = parseInt(service.substring(5, 9))
      if (lastID > options.lastID) {
        options.lastID = lastID
      }
      options.data[serviceID] = { category, services: {} }
      options.data[serviceID].services[service] = [mac]
    }
    else if (options.data[serviceID].services[service] === undefined) {
      options.data[serviceID].services[service] = [mac]
    }
    else {
      options.data[serviceID].services[service].push(mac)
    }
  }
  saveOptions()
}

interface Options {
  lastID: number
  data: OptionsData
}
interface OptionsData {
  [key: string]: OptionsDataItem
}
interface OptionsDataItem {
  category: string
  services: OptionsDataItemServices
}
interface OptionsDataItemServices {
  [key: string]: string[]
}