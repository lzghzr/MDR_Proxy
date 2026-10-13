#!/bin/bash
if [ -z `command -v curl` ] || [ -z `command -v jq` ] || [ -z `command -v wget` ] || [ -z `command -v openssl` ] || [ -z `command -v java` ] || [ -z `command -v zip` ]; then
  echo "请安装 curl, jq, wget, openssl, java, zip"
  echo "please install curl, jq, wget, openssl, java, zip"
  exit 127
fi
# 下载 GitHub 最新 release 的 jar
# download the jar from the latest GitHub release
download_jar() {
  wget -O "$2" "$(curl -sL "https://api.github.com/repos/$1/releases/latest" | jq -r '.assets[].browser_download_url|select(endswith(".jar"))' | head -1)" || rm -f "$2"
}
# 下载 APKEditor.jar, uber-apk-signer.jar
# download APKEditor.jar, uber-apk-signer.jar
[ -f "APKEditor.jar" ] || download_jar REAndroid/APKEditor APKEditor.jar
[ -f "uber-apk-signer.jar" ] || download_jar patrickfav/uber-apk-signer uber-apk-signer.jar
# 获取 apk 版本
# get apk version
soundconnect_version=""
# 下载 SoundConnect.apk
# download SoundConnect.apk
if [ ! -f "SoundConnect.apk" ];then
  soundconnect_url=$(curl -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36 Edg/155.0.0.0" https://www.sonystyle.com.cn/minisite/cross/appcenter/pa/sound_connect/index.html | sed "s/\"/\n/g" | grep "/minisite/cross/app/download/")
  soundconnect_version=$(echo $soundconnect_url | awk -Ft_v '{ print $NF }' | sed "s/.apk//")
  wget $soundconnect_url -O SoundConnect.apk
fi
# 未从下载链接取得版本时, 从 apk 本身读取
# read the version from the apk when it is not derived from the download url
if [ -z "$soundconnect_version" ];then
  soundconnect_version=$(java -jar APKEditor.jar info -version-name -i SoundConnect.apk | sed -n 's/^VersionName="\(.*\)"$/\1/p')
fi
# 生成证书
# generating a certificate
if [ "$1" != "nocert" ];then
  openssl req -x509 -days 365 -config info.update.sony.net.conf -out mdrproxy-cert.pem -keyout mdrproxy-key.pem
fi
# 解包app, 展开到本地临时目录
# unpacking app into a local temporary directory
WORK=$(mktemp -d "${TMPDIR:-/tmp}/mdrproxy.XXXXXX") || exit 1
trap 'rm -rf "${WORK:?}"' EXIT
trap 'exit 1' INT TERM HUP
java -jar APKEditor.jar d -t xml -dex -i SoundConnect.apk -o "$WORK/SoundConnect"
PROJ="$WORK/SoundConnect"
# 修改app配置
# modifying app configuration
sed -i 's|android:name="com.sony.songpal.mdr.vim.MdrApplication"|& android:networkSecurityConfig="@xml/network_security_config"|' "$PROJ/AndroidManifest.xml"
if ! grep -q 'android:networkSecurityConfig="@xml/network_security_config"' "$PROJ/AndroidManifest.xml"; then
  echo "修改 AndroidManifest.xml 失败"
  echo "failed to modify AndroidManifest.xml"
  exit 1
fi
RES=$(ls -d "$PROJ"/resources/*/res 2>/dev/null | head -1)
RAW="$PROJ/root/res/raw"
if [ -z "$RES" ] || [ ! -d "$RES/values" ] || [ ! -d "$RAW" ]; then
  echo "解包目录结构异常"
  echo "unexpected unpacked directory structure"
  exit 1
fi
# 添加网络安全配置
# adding network security configuration
mkdir -p "$RES/xml"
cp network_security_config.xml "$RES/xml/network_security_config.xml"
# 添加证书
# adding certificate
cp mdrproxy-cert.pem "$RAW/mdrproxy_ca.pem"
# 声明新增资源(需要显式指定 id, 取该类型当前最大 id 加一)
# declaring the added resources
next_id() {
  local cur
  cur=$(grep -oE "<public id=\"0x[0-9a-f]+\" type=\"$1\"" "$RES/values/public.xml" | grep -oE '0x[0-9a-f]+' | sort | tail -1)
  if [ -z "$cur" ];then
    echo "找不到 type=\"$1\" 的资源 id"
    echo "no resource id found for type=\"$1\""
    exit 1
  fi
  printf '0x%x' $(( cur + 1 ))
}
XML_ID=$(next_id xml)
RAW_ID=$(next_id raw)
sed -i "s|</resources>|<public id=\"$XML_ID\" type=\"xml\" name=\"network_security_config\" /><public id=\"$RAW_ID\" type=\"raw\" name=\"mdrproxy_ca\" /></resources>|" "$RES/values/public.xml"
sed -i 's|</resources>|<raw name="mdrproxy_ca">res/raw/mdrproxy_ca.pem</raw></resources>|' "$RES/values/raws.xml"
if ! grep -q 'name="network_security_config"' "$RES/values/public.xml" || ! grep -q '<raw name="mdrproxy_ca"' "$RES/values/raws.xml"; then
  echo "声明新增资源失败"
  echo "failed to declare the added resources"
  exit 1
fi
# 重新打包
# repacking app
java -jar APKEditor.jar b -i "$PROJ" -o SoundConnect_new.apk
# 校验资源表
# verifying the resource table
java -jar APKEditor.jar info -resources -i SoundConnect_new.apk > "$WORK/res.txt"
if ! grep -q "xml/network_security_config" "$WORK/res.txt" || ! grep -q "raw/mdrproxy_ca" "$WORK/res.txt"; then
  echo "资源表校验失败"
  echo "resource table verification failed"
  exit 1
fi
# 签名
# signing
java -jar uber-apk-signer.jar -a SoundConnect_new.apk
# 重命名&zip
# rename&zip
if [ -z "$soundconnect_version" ];then
  mv SoundConnect_new-aligned-debugSigned.apk SoundConnect_unknow_unsafe.apk
  zip SoundConnect_unknow_unsafe.zip SoundConnect_unknow_unsafe.apk mdrproxy-key.pem mdrproxy-cert.pem
else
  mv SoundConnect_new-aligned-debugSigned.apk SoundConnect_${soundconnect_version}_unsafe.apk
  zip SoundConnect_${soundconnect_version}_unsafe.zip SoundConnect_${soundconnect_version}_unsafe.apk mdrproxy-key.pem mdrproxy-cert.pem
fi
# 清除临时文件
# clean
rm -f SoundConnect_new-aligned-debugSigned.apk.idsig
rm -f SoundConnect_new.apk
