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
options.data ??= {}
options.scanMax = Math.max(options.scanMax ?? options.lastID, options.lastID)
const initialKnownIDCount = Object.keys(options.data).length

const SCAN_STEP = 100
const scanIDs = process.env.MDR_SCAN_IDS !== 'false'
/**
 * 服务器访问限制
 * Server access restriction
 *
 */
class AccessRestrictionError extends Error {
  constructor(readonly statusCode: 403 | 429) {
    super(`Sony server returned HTTP ${statusCode}`)
    this.name = 'AccessRestrictionError'
  }
}

const requestStats: Record<RequestType, RequestStats> = {
  info: createRequestStats(),
  firmware: createRequestStats()
}
let knownIDsChecked = 0
let historicalGapsChecked = 0
let newIDsProbed = 0
const previousScanMax = options.scanMax
  ;
(async () => {
  // 更新最新固件
  // Update the latest firmware
  for (const serviceID in options.data) {
    knownIDsChecked++
    await getInfo(options.data[serviceID].category, serviceID)
  }

  // 每日任务只更新已知ID的固件
  // Daily runs only update firmware for known IDs
  if (!scanIDs) {
    saveOptions()
    writeSummary()
    return
  }

  const knownIDs = Object.keys(options.data).map(Number)
  const minKnownID = knownIDs.length > 0 ? Math.min(...knownIDs) : options.lastID

  // 补扫历史缺失ID
  // Recheck missing historical IDs
  for (let serviceID = minKnownID; serviceID <= previousScanMax; serviceID++) {
    if (serviceID in options.data) {
      continue
    }
    historicalGapsChecked++
    await getInfo(getCategory(serviceID), serviceID.toString())
  }

  // 扫描新的100个ID, 全部完成后再推进扫描上界
  // Scan the next 100 IDs and advance the boundary after completing the scan
  const targetScanMax = previousScanMax + SCAN_STEP
  for (let serviceID = previousScanMax + 1; serviceID <= targetScanMax; serviceID++) {
    if (serviceID in options.data) {
      continue
    }
    newIDsProbed++
    await getInfo(getCategory(serviceID), serviceID.toString())
  }

  options.scanMax = targetScanMax
  saveOptions()
  writeSummary()
})().catch((error: unknown) => {
  writeSummary(error)
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
/**
 * 获取产品类别
 * Get the product category
 *
 * @param {number} serviceID
 * @returns {string}
 */
function getCategory(serviceID: number): string {
  if (serviceID <= 2942) {
    return 'HP001'
  }
  else {
    return 'HP002'
  }
}
/**
 * 保存mdrdownload.json
 *
 */
function saveOptions() {
  fs.writeFileSync('./mdrdownload.json', JSON.stringify(options, undefined, 2))
}
/**
 * 初始化请求统计
 * Initialize request statistics
 *
 * @returns {RequestStats}
 */
function createRequestStats(): RequestStats {
  return {
    total: 0,
    counts: { '200': 0, '404': 0, '403': 0, '429': 0, '5xx': 0, other: 0, network: 0 }
  }
}
/**
 * 统计请求结果
 * Record the request result
 *
 * @param {RequestType} requestType
 * @param {number} [statusCode]
 */
function recordRequest(requestType: RequestType, statusCode?: number): void {
  const stats = requestStats[requestType]
  stats.total++
  if (statusCode === undefined) {
    stats.counts.network++
  }
  else if (statusCode === 200 || statusCode === 404 || statusCode === 403 || statusCode === 429) {
    stats.counts[<StatusBucket>statusCode.toString()]++
  }
  else if (statusCode >= 500 && statusCode <= 599) {
    stats.counts['5xx']++
  }
  else {
    stats.counts.other++
  }
}
/**
 * 输出运行摘要
 * Write the run summary
 *
 * @param {unknown} [error]
 */
function writeSummary(error?: unknown): void {
  const output: string[] = [
    '## MDR Firmware Scan',
    '',
    `Mode: ${scanIDs ? 'Firmware updates and ID scan' : 'Firmware updates'}`,
    `Known service IDs: ${initialKnownIDCount} → ${Object.keys(options.data).length}`,
    `Known IDs checked: ${knownIDsChecked}`,
    `Historical gaps checked: ${historicalGapsChecked}`,
    `New IDs probed: ${newIDsProbed}`,
    '',
    'Scan boundary:',
    `${previousScanMax} → ${options.scanMax}`,
    '',
    '| Request | Total | 200 | 404 | 403 | 429 | 5xx | Other | Network |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    formatStatsRow('info'),
    formatStatsRow('firmware'),
    ''
  ]
  if (error instanceof AccessRestrictionError) {
    output.push(`Result: ❌ Sony server returned HTTP ${error.statusCode}.`, 'Scan stopped and scanMax was not advanced.')
  }
  else if (error !== undefined) {
    output.push(`Result: ❌ Scan failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  else if (hasTransientErrors()) {
    output.push('Result: ⚠️ Scan completed with transient server/network errors.', 'Missing IDs will be retried on the next run.')
  }
  else {
    output.push('Result: ✅ Sony server reachable; no access restriction detected.')
  }

  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (summaryPath) {
    fs.appendFileSync(summaryPath, `${output.join('\n')}\n`)
  }
  else {
    console.log(output.join('\n'))
  }
}
/**
 * 格式化请求统计
 * Format request statistics
 *
 * @param {RequestType} requestType
 * @returns {string}
 */
function formatStatsRow(requestType: RequestType): string {
  const stats = requestStats[requestType]
  const label = requestType === 'info' ? 'info.xml' : 'firmware'
  return `| ${label} | ${stats.total} | ${stats.counts['200']} | ${stats.counts['404']} | ${stats.counts['403']} | ${stats.counts['429']} | ${stats.counts['5xx']} | ${stats.counts.other} | ${stats.counts.network} |`
}
/**
 * 检查服务器或网络错误
 * Check for server or network errors
 *
 * @returns {boolean}
 */
function hasTransientErrors(): boolean {
  for (const requestType in requestStats) {
    const counts = requestStats[<RequestType>requestType].counts
    if (counts['5xx'] > 0 || counts.other > 0 || counts.network > 0) {
      return true
    }
  }
  return false
}
/**
 * webGet
 *
 * @param {string} url
 * @param {RequestType} requestType
 * @returns {Promise<WebResult>}
 */
function webGet(url: string, requestType: RequestType): Promise<WebResult> {
  return new Promise<WebResult>(resolve => {
    let completed = false
    const finish = (result: WebResult): void => {
      if (completed) {
        return
      }
      completed = true
      recordRequest(requestType, result.statusCode)
      resolve(result)
    }
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
            finish({ statusCode: res.statusCode, data: Buffer.concat(rawData) })
          })
          .on('error', () => {
            finish({})
          })
      })
      .on('error', () => {
        finish({})
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
    const response = await webGet(`https://info.update.sony.net/${category}/${service}/info/info.xml`, 'info')
    if (response.statusCode === 403 || response.statusCode === 429) {
      throw new AccessRestrictionError(response.statusCode)
    }
    const data = response.statusCode === 200 ? response.data : undefined
    if (data === undefined) {
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
    const response = await webGet(url, 'firmware')
    if (response.statusCode === 403 || response.statusCode === 429) {
      throw new AccessRestrictionError(response.statusCode)
    }
    const fw = response.statusCode === 200 ? response.data : undefined
    if (fw === undefined) {
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
      const lastID = parseInt(serviceID)
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

type RequestType = 'info' | 'firmware'
type StatusBucket = '200' | '404' | '403' | '429' | '5xx' | 'other' | 'network'
interface WebResult {
  statusCode?: number
  data?: Buffer
}
interface RequestStats {
  total: number
  counts: Record<StatusBucket, number>
}
interface Options {
  lastID: number
  scanMax?: number
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
