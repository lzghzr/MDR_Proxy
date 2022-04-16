import fs from 'fs'
import zlib from 'zlib'
import http from 'http'
import https from 'https'
import crypto from 'crypto'

if (!fs.existsSync('./mdrdownload.json'))
  fs.writeFileSync('./mdrdownload.json', '{"data":{}}')

if (!fs.existsSync('./firmware/'))
  fs.mkdirSync('./firmware/')

const options: Options = JSON.parse(fs.readFileSync('./mdrdownload.json').toString())

const MIN = options.lastID || 2853
  ;
(async () => {
  // 更新最新固件
  if (options.data !== undefined) {
    for (const service in options.data)
      await getInfo(options.data[service].category, service)
  }
  // 扫描新ID
  for (let categoryID = 1; categoryID < 3; categoryID++) {
    for (let serviceID = MIN; serviceID < MIN + 10; serviceID++) {
      if ((categoryID === 1 && serviceID > 2942) || (categoryID === 2 && serviceID < 2943)) continue
      const category = `HP00${categoryID}`
      const service = `MDRID${serviceID}00`
      await getInfo(category, service)
    }
  }
})()

function saveOptions() {
  fs.writeFileSync('./mdrdownload.json', JSON.stringify(options, undefined, 2))
}

function webGet(url: string): Promise<Buffer | undefined> {
  return new Promise<Buffer | undefined>((resolve, _reject) => {
    let web: typeof https | typeof http
    if (url.startsWith('https'))
      web = https
    else
      web = http
    web.get(url, {
      headers: {
        'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 11; XQ-AT52 Build/58.1.A.5.159)',
        'Accept-Encoding': 'gzip'
      }
    },
      res => {
        let cRes: http.IncomingMessage | zlib.Gunzip | zlib.Inflate
        let rawData: Buffer[] = []
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
              console.error('服务器错误', res.statusCode, data.toString())
              resolve(undefined)
            }
            resolve(data)
          })
          .on('error', e => {
            console.error('数据接收错误', e)
            resolve(undefined)
          })
      })
      .on('error', e => {
        console.error('请求错误', e)
        resolve(undefined)
      })
  })
}

async function getInfo(category: string, service: string) {
  const data = await webGet(`https://info.update.sony.net/${category}/${service}/info/info.xml`)
  if (data === undefined) return console.error('数据获取错误', category, service)
  // 分割数据
  const headerLength = data.indexOf('\n\n')
  // 头部数据
  const header = data.slice(0, headerLength).toString()
  // 解析头部
  const headerSplit = header.match(/eaid:(?<eaid>.*)\ndaid:(?<daid>.*)\ndigest:(?<digest>.*)/)
  if (headerSplit === null) return console.error('数据头错误', header)
  const { eaid, daid, digest } = <{ [key: string]: string }>headerSplit.groups
  let enc = ''
  switch (eaid) {
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
  switch (daid) {
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
  if (enc === '' || has === '') return console.error('加密信息错误', header)
  // xml数据
  const cryptedData = data.slice(headerLength + 2)
  let keyBuffer: Buffer
  let decryptedData = ''
  if (enc === 'none') decryptedData = cryptedData.toString()
  else {
    if (enc === 'des-ede3') keyBuffer = Buffer.alloc(24)
    else keyBuffer = Buffer.from([79, -94, 121, -103, -1, -48, -117, 31, -28, -46, 96, -43, 123, 109, 60, 23])
    const decipher = crypto.createDecipheriv(enc, keyBuffer, '')
    decipher.setAutoPadding(false)
    decryptedData = Buffer.concat([decipher.update(cryptedData), decipher.final()]).toString()
  }
  // 数据校验
  if (has !== 'none') {
    const dataHash = crypto.createHash(has).update(decryptedData).digest('hex')
    const hash = crypto.createHash(has).update(dataHash + service + category).digest('hex')
    if (hash !== digest) return console.error('数据校验错误', header)
  }
  // 下载固件
  await getFirmware(decryptedData, category, service)
}

async function getFirmware(infoData: string, category: string, service: string) {
  // 解析数据, 一般只有一个
  const infoRegex = infoData.match(/\<Distribution ID="FW".*MAC="(?<mac>[^"]*)".*URI="(?<url>[^"]*)".*\/\>/)
  if (infoRegex === null) return console.error('未找到固件信息', infoData)
  const { mac, url } = <{ [key: string]: string }>infoRegex.groups
  if (options.data[service]?.mac === mac) return console.error('已是最新', service)
  const fileNameRegex = url.match(/\/([^\/]*)\.bin/)
  if (fileNameRegex === null) return console.error('解析文件名错误', service, url)
  const fileName = fileNameRegex[1]
  // 下载固件
  const fw = await webGet(url)
  if (fw === undefined) return console.error('下载固件错误', service, url)
  const fwSHA1 = crypto.createHash('SHA1').update(fw).digest('hex')
  if (fwSHA1 !== mac) return console.error('固件SHA1错误', service)
  if (!fs.existsSync(`./firmware/${service}/`))
    fs.mkdirSync(`./firmware/${service}/`)
  fs.writeFileSync(`./firmware/${service}/${fileName}.bin`, fw)
  fs.writeFileSync(`./firmware/${service}/${fileName}.sha1`, fwSHA1)
  options.lastID = parseInt(service.substring(5, 9))
  options.data[service] = { category, service, mac }
  saveOptions()
}

interface Options {
  lastID?: number
  data: OptionsData
}
interface OptionsData {
  [key: string]: OptionsDataItem
}
interface OptionsDataItem {
  category: string
  service: string
  mac: string
}