import fs from 'fs'
import zlib from 'zlib'
import http from 'http'
import https from 'https'
import crypto from 'crypto'

const categoryID = process.argv[2] || 'HP001'
const serviceID = process.argv[3] || 'MDRID285300'

https.get(`https://info.update.sony.net/${categoryID}/${serviceID}/info/info.xml`, {
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
          return console.error('服务器错误', res.statusCode, data.toString())
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
          return console.error('数据头错误', header)
        }
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
        if (enc === '' || has === '') {
          return console.error('加密信息错误', header)
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
            const keyBuffer = Buffer.alloc(24)
            const decipher = crypto.createDecipheriv(enc, keyBuffer, '')
            decipher.setAutoPadding(false)
            decryptedData = Buffer.concat([decipher.update(cryptedData), decipher.final()]).toString()
          }
          else {
            decryptedData = AESdecipher(cryptedData)
          }
        }
        // 数据校验
        // Data verification
        if (has !== 'none') {
          const dataHash = gethash(has, decryptedData)
          const hash = gethash(has, dataHash + serviceID + categoryID)
          if (hash !== digest) {
            decryptedData = AESdecipher(cryptedData, true)
            const dataHashGM = gethash(has, decryptedData)
            const hashGM = gethash(has, dataHashGM + serviceID + categoryID)
            if (hashGM !== digest) {
              return console.error('数据校验错误', header)
            }
          }
        }
        // 写入数据
        // Write data
        fs.writeFile(`./${categoryID}_${serviceID}.xml`, decryptedData, error => {
          if (error !== null) {
            console.error('数据写入错误', error)
          }
        })
      })
      .on('error', e => {
        console.error('数据接收错误', e)
      })
  })
  .on('error', e => {
    console.error('请求错误', e)
  })

function AESdecipher(cryptedData: Buffer, GM = false): string {
  let keyBuffer: Buffer
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

function gethash(algorithm: string, data: Buffer | string): string {
  return crypto.createHash(algorithm).update(data).digest('hex')
}