#!/bin/sh
set -e

tempDir='test'
# 临时上传文件夹
if ! mkdir $tempDir ; then
    echo ''
fi    


# 生成证书         



cp mdrproxy_ca.pem mdrproxy-cert.pem
cp mdrproxy_key.pem mdrproxy-key.pem
# # 解包app
java -jar apktool.jar d --output Headphones --no-src $1
# # 修改app配置
sed -i '' 's/android:name="com.sony.songpal.mdr.vim.MdrApplication" android:roundIcon="@mipmap\/icon_round"/android:name="com.sony.songpal.mdr.vim.MdrApplication" android:networkSecurityConfig="@xml\/network_security_config" android:roundIcon="@mipmap\/icon_round"/' Headphones/AndroidManifest.xml
# 添加网络安全配置
cp network_security_config.xml Headphones/res/xml/network_security_config.xml
# 添加证书
cp mdrproxy_ca.pem Headphones/res/raw/mdrproxy_ca.pem
# 重新打包
java -jar apktool.jar b --output Headphones_new.apk Headphones
# 签名
java -jar uber-apk-signer.jar -a Headphones_new.apk


#  rm -rf test/* && mv -f *.pem Headphones/ test/
if ! rm -rf test/* ; then
    echo ''
fi    
mv -f *.pem Headphones/ Headphones_new* test/



