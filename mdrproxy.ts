import net from 'net'
import zlib from 'zlib'
import http from 'http'
import https from 'https'
import { promisify } from 'util'
import { existsSync, readdir, readFile } from 'fs'
import { createInterface } from 'readline'
import { createHash, createCipheriv, createDecipheriv } from 'crypto'

const hasKey = existsSync(`${__dirname}/security/mdrproxy-key.pem`)
const hasCert = existsSync(`${__dirname}/security/mdrproxy-cert.pem`)
if (!hasKey || !hasCert) throw '未找到证书文件'

const FSreadFile = promisify(readFile)
const FSreaddir = promisify(readdir)
// 自定义的升级信息
// Custom upgrade information
const infoXML = `<?xml version="1.0" encoding="UTF-8"?><InformationFile LastUpdate="2021-05-01T00:00:00Z" Noop="false" Version="1.0">
<ControlConditions DefaultServiceStatus="open" DefaultVariance="0"/>
<ApplyConditions>
    <ApplyCondition ApplyOrder="1" Force="false">
        <Rules>
            <Rule Type="System" Key="Model" Value="CUSTOM" Operator="NotEqual"/>
            <Rule Type="System" Key="SerialNo" Value="0" Operator="GreaterThanEqual"/>
            <Rule Type="System" Key="FirmwareVersion" Value="0" Operator="NotEqual"/>
        </Rules>
        <Distributions>
            <Distribution ID="FW" InstallParams="" InstallType="binary" MAC="{FWsha1}" Size="{FWlength}" Type="" URI="https://info.update.sony.net/custom_fw.bin" Version="1"/>
            <Distribution ID="Disclaimer" InstallParams="" InstallType="notice" MAC="{Disclaimersha1}" Size="{Disclaimerlength}" Type="" URI="https://info.update.sony.net/custom_disclaimer.xml" Version="1"/>
        </Distributions>
        <Descriptions DefaultLang="Chinese(Simplified)">
            <Description Lang="Chinese(Simplified)" Title="CS"><![CDATA[请勿插入音频线，USB线或充电保护盒。
否则可能会导致本设备发生故障。]]></Description>
        </Descriptions>
    </ApplyCondition>
</ApplyConditions>
</InformationFile>`
// 自定义的免责声明
// Custom disclaimer
const disclaimerXML = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?> 

<NoticeFile Version="1.0" DefaultLocale="China">
    <Notice Locale="China">
        <Text><![CDATA[
※ 请在蓝牙连接最稳定的环境下进行更新。
* 请注意，在乘坐火车等车辆时，或者在Wi-Fi、微波炉、无绳电话以及其他许多无线电波等2.4GHz频带的无线电波混杂的环境中，不要更新。

※ Sony | Headphones Connect ※
更新主机之前，请更新至最新版本

[警告]
0) 本人不对因使用此软件造成的任何损失负责，使用前请确保为正品行货，做好需要保修的心理准备
1) 软件更新需要大约34分钟（Android）和44分钟（iOS）
更新下载、数据传输和更新期间切勿"关闭电源"。
否则，该装置可能会变得无法使用。
2) 请在确认这些耳机和Android设备（或iOS设备）有足够的电池寿命后更新。
3) 如果Bluetooth Low Energy设备（佩戴式终端，智能手表等）连接到Android设备（或iOS设备），则可能无法更新。
更新之前，请断开所有蓝牙设备和Android设备（或iOS设备）的连接。

]]></Text>
    </Notice>
</NoticeFile>`)

start()

/**
 * 也可以使用匿名函数
 * You can also use anonymous functions
 */
async function start() {
  const select0 = await choose0()
  switch (select0) {
    case '1':
      startProxy('1')
      break
    case '2': {
      const select02 = await choose02()
      switch (select02) {
        case '0':
          startProxy('20')
          break
        case '1':
          startProxy('21')
          break
        case '2':
          startProxy('22')
          break
        case '3':
          startProxy('23')
          break
      }
      break
    }
    case '3': {
      const select03 = await choose03()
      startProxy('3', select03)
      break
    }
  }
}
/**
 * 简单的cli交互
 * Simple cli interaction
 * @returns {Promise<string>}
 */
function choose(): Promise<string> {
  return new Promise(resolve => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    })
    rl.prompt()
    rl.once('line', line => {
      rl.close()
      resolve(line)
    })
  })
}
async function choose0(): Promise<string> {
  console.log(`请选择功能:
1. 强制更新固件
2. 强制切换地区(并不是所有设备都支持)
3. 强刷自定义固件(非常危险!非常危险!!非常危险!!!)`)
  console.log(`Please select the function:
1. Force update firmware
2. Force switch region(not all devices support)
3. Force flash custom firmware(very dangerous!very dangerous!!very dangerous!!!)`)

  const select = await choose()
  if (['1', '2', '3'].includes(select)) return select
  else return choose0()
}
async function choose02(): Promise<string> {
  console.log(`请选择区域:
0. 00(EN)
1. 01(SPLC)
2. 02(CN)
3. 03(unknown)`)
  console.log(`Please select the region:
0. 00(EN)
1. 01(SPLC)
2. 02(CN)
3. 03(unknown)`)
  const select = await choose()
  if (['0', '1', '2', '3'].includes(select)) return select
  else return choose02()
}
async function choose03(): Promise<Buffer> {
  const files = await FSreaddir(`${__dirname}/custom/`)
  console.log('请选择固件, Please select firmware:')
  files.forEach((name, id) => console.log(`${id + 1}. ${name}`))
  const select = await choose()
  const file = files[+select - 1]
  if (file !== undefined) return await FSreadFile(`${__dirname}/custom/${file}`)
  else return choose03()
}
/**
 * 
 * https://github.com/wuchangming/https-mitm-proxy-handbook/
 * 
 * @param {string} mode
 * @param {Buffer} [fw]
 */
async function startProxy(mode: string, fw?: Buffer) {
  const ssl = {
    key: await FSreadFile(`${__dirname}/security/mdrproxy-key.pem`),
    cert: await FSreadFile(`${__dirname}/security/mdrproxy-cert.pem`)
  }
  const fakeServer = https.createServer(ssl)
    .on('request', async (cReq: http.IncomingMessage, cRes: http.ServerResponse) => {
      const u = new URL(`https://info.update.sony.net${cReq.url}`)
      console.log('已捕获到', cReq.url)
      // 拦截 info.xml
      // Intercept info.xml
      if (u.pathname.endsWith('info.xml')) {
        // 提取 categoryID 和 serviceID
        // Extract categoryID and serviceID
        const pathSplit = u.pathname.match(/\/(?<categoryID>\w{5})\/(?<serviceID>\w{11})\//)
        if (pathSplit === null) nothing()
        else {
          const { categoryID, serviceID } = <{ [key: string]: string }>pathSplit.groups
          if (mode === '1' || mode[0] === '2') {
            // 切换区域
            // Switch region
            const newServiceID = mode === '1' ? serviceID : `${serviceID.slice(0, -1)}${mode[1]}`
            const XML = await decryptedXML(categoryID, newServiceID)
            if (XML === undefined) nothing()
            else {
              // 替换升级检查条件, 实现强制升级
              // Replace the upgrade check condition to force the upgrade
              const editedXML = XML.replace(/<Rule Type="System" Key="FirmwareVersion" Value="[\d\.]+" Operator=".+?"\/>/g,
                '<Rule Type="System" Key="FirmwareVersion" Value="0" Operator="NotEqual"/>')
              const myXML = await encryptedXML(categoryID, serviceID, editedXML)
              end(zlib.gzipSync(myXML), { 'Content-Type': 'application/xml' })
            }
          }
          else if (mode === '3') {
            // 构建 info.xml
            // Build info.xml
            const editedXML = infoXML
              .replace('{FWsha1}', getHash('sha1', <Buffer>fw))
              .replace('{FWlength}', (<Buffer>fw).length.toString())
              .replace('{Disclaimersha1}', getHash('sha1', disclaimerXML))
              .replace('{Disclaimerlength}', disclaimerXML.length.toString())
            const myXML = await encryptedXML(categoryID, serviceID, editedXML)
            end(zlib.gzipSync(myXML), { 'Content-Type': 'application/xml' })
          }
          else nothing()
        }
      } else if (u.pathname === '/custom_fw.bin') {
        end(zlib.gzipSync(<Buffer>fw), { 'Content-Type': 'application/octet-stream' })
      } else if (u.pathname === '/custom_disclaimer.xml') {
        end(zlib.gzipSync(disclaimerXML), { 'Content-Type': 'application/xml' })
      } else nothing()
      /**
       * 传输自定义文件
       * Transfer custom file
       *
       * @param {Buffer} data
       * @param {http.OutgoingHttpHeaders} [headers]
       */
      function end(data: Buffer, headers?: http.OutgoingHttpHeaders) {
        cRes.writeHead(200, Object.assign({
          'Accept-Ranges': 'bytes',
          'Content-Encoding': 'gzip',
          'Content-Length': data.length,
        },
          headers))
        cRes.write(data, 'binary')
        cRes.end()
      }
      /**
       * 简单代理
       * Simple proxy
       *
       */
      function nothing() {
        const options = {
          hostname: u.hostname,
          port: u.port || 443,
          path: u.pathname,
          method: cReq.method,
          headers: cReq.headers
        }

        const pReq = https.request(options, pRes => {
          cRes.writeHead(<number>pRes.statusCode, pRes.headers)
          pRes.pipe(cRes)
        }).on('error', () => cRes.end())
        cRes.on('error', () => cReq.destroy())
        cReq.pipe(pReq)
      }
    })
    .listen(0, 'localhost')

  http.createServer()
    .on('connect', (cReq: http.IncomingMessage, cSock: net.Socket, head: Buffer) => {
      const u = new URL('http://' + cReq.url)
      let port: number
      let hostname: string
      if (u.hostname === 'info.update.sony.net') {
        port = (<net.AddressInfo>fakeServer.address()).port
        hostname = 'localhost'
      }
      else {
        port = Number.parseInt(u.port)
        hostname = u.hostname
      }
      const pSock = net.connect(port, hostname, () => {
        cSock.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        pSock.write(head)
        pSock.pipe(cSock)
        cSock.pipe(pSock)
      }).on('error', () => cSock.end())
      cSock.on('error', () => pSock.end())
    })
    .listen(8848, '0.0.0.0', () => { console.log('已启动代理服务, 端口: 8848') })
}
/**
 * 解密 info.xml
 * Decrypt info.xml
 *
 * @param {string} categoryID
 * @param {string} serviceID
 * @returns {(Promise<string | undefined>)}
 */
function decryptedXML(categoryID: string, serviceID: string): Promise<string | undefined> {
  return new Promise(resolve => {
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
              console.error(res.statusCode, data.toString())
              resolve(undefined)
            }
            else {
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
                console.log(header)
                return resolve(undefined)
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
                console.log(header)
                return resolve(undefined)
              }
              // xml数据
              // xml data
              const cryptedData = data.slice(headerLength + 2)
              let keyBuffer: Buffer
              let decryptedData = ''
              if (enc === 'none') decryptedData = cryptedData.toString()
              else {
                if (enc === 'des-ede3') keyBuffer = Buffer.alloc(24)
                else keyBuffer = Buffer.from([79, -94, 121, -103, -1, -48, -117, 31, -28, -46, 96, -43, 123, 109, 60, 23])
                const decipher = createDecipheriv(enc, keyBuffer, '')
                decipher.setAutoPadding(false)
                decryptedData = Buffer.concat([decipher.update(cryptedData), decipher.final()]).toString()
              }
              // 数据校验
              // Data verification
              if (has !== 'none') {
                const dataHash = getHash(has, decryptedData)
                const hash = getHash(has, dataHash + serviceID + categoryID)
                if (hash !== digest) {
                  console.log(header)
                  return resolve(undefined)
                }
              }
              resolve(decryptedData)
            }
          })
          .on('error', e => {
            console.error('数据接收错误', e)
            resolve(undefined)
          })
      }).on('error', e => {
        console.error('请求错误', e)
        resolve(undefined)
      })
  })
}
/**
 * 加密 info.xml
 * Encrypt info.xml
 *
 * @param {string} categoryID
 * @param {string} serviceID
 * @param {string} decryptedData
 * @returns {Promise<Buffer>}
 */
function encryptedXML(categoryID: string, serviceID: string, decryptedData: string): Promise<Buffer> {
  return new Promise(resolve => {
    // 去除原有填充
    // Remove original padding
    const decryptedDataBuffer = Buffer.from(decryptedData.trimEnd())
    // 使用 ' ' 填充数据
    // Use ' ' to pad data
    const padBuffer = Buffer.alloc(32 - decryptedDataBuffer.length % 32, ' ')
    const WTFXMLBuffer = padBuffer.length === 32 ? decryptedDataBuffer : Buffer.concat([decryptedDataBuffer, padBuffer])
    const dataHash = getHash('sha1', WTFXMLBuffer)
    const hash = getHash('sha1', dataHash + serviceID + categoryID)
    // 构建头部
    // Build header
    const headerBuffer = Buffer.from(`eaid:ENC0003
daid:HAS0003
digest:${hash}

`)
    const keyBuffer = Buffer.from([79, -94, 121, -103, -1, -48, -117, 31, -28, -46, 96, -43, 123, 109, 60, 23])
    const encipher = createCipheriv('aes-128-ecb', keyBuffer, '')
    encipher.setAutoPadding(false)
    const bodyBuffer = Buffer.concat([encipher.update(WTFXMLBuffer), encipher.final()])
    const encryptedData = Buffer.concat([headerBuffer, bodyBuffer])
    resolve(encryptedData)
  })
}
/**
 * 计算 hash
 * Calculate hash
 *
 * @param {string} algorithm
 * @param {(string | Buffer)} data
 * @returns {string}
 */
function getHash(algorithm: string, data: string | Buffer): string {
  return createHash(algorithm).update(data).digest('hex')
}