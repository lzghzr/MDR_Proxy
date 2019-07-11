import fs from 'fs'
import zlib from 'zlib'
import http from 'http'
import crypto from 'crypto'

const categoryID = process.argv[2] || 'HP001'
const serviceID = process.argv[3] || 'MDRID285300'

http.get(`http://info.update.sony.net/${categoryID}/${serviceID}/info/info.xml`, {
  headers: {
    'User-Agent': 'Dalvik/2.1.0',
    'Accept-Encoding': 'gzip, deflate'
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
        if (res.statusCode !== 200) return console.error('服务器错误', res.statusCode, data.toString())
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
          const hash = crypto.createHash(has).update(dataHash + serviceID + categoryID).digest('hex')
          if (hash !== digest) return console.error('数据校验错误', header)
        }
        // 写入数据
        fs.writeFile(`./${categoryID}_${serviceID}.xml`, decryptedData, error => {
          if (error !== null) console.error('数据写入错误', error)
        })
      })
      .on('error', e => {
        console.error('数据接收错误', e)
      })
  })
  .on('error', e => {
    console.error('请求错误', e)
  })