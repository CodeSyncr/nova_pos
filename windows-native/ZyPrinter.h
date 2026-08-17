//{{NO_DEPENDENCIES}}
// Microsoft Visual C++ 生成的包含文件。
// 供 ZyPrinter.h 使用
//

#pragma once

#define USE_EXTERN_C 0

#if USE_EXTERN_C
#ifdef __cplusplus  
extern "C" {
#endif  
#endif

//#define ZYPRINTERDLL_API 
//#define ZYFUNcall
#define ZYPRINTERDLL_API __declspec(dllexport)
#define ZYFUNcall __stdcall

/************************************************************************************/
//printer verified api
ZYPRINTERDLL_API int   ZYFUNcall printer_verified_initial(char *password, unsigned char mode);;
ZYPRINTERDLL_API UINT8 ZYFUNcall Get_printer_verified();
ZYPRINTERDLL_API UINT8 ZYFUNcall Set_printer_verified(UINT8 flag);
ZYPRINTERDLL_API int   ZYFUNcall CompareData(char *s1, char *s2, UINT16 bLength);
ZYPRINTERDLL_API UINT8 ZYFUNcall Creat_validation_data_packet(char *ValiBuffer, char  *EncryptBuffer);
ZYPRINTERDLL_API UINT8 ZYFUNcall Creat_set_password_data_packet(char *Buffer);
ZYPRINTERDLL_API UINT8 ZYFUNcall Creat_host_verified_confirmation_data_packet(char *Buffer);

/************************************************************************************/
#define USB_PORT 1
#define COM_PORT 2
#define NET_PORT 3
#define LPT_PORT 4

/*
以字符串的方式发送等值的Hex数据, 从指定的通讯端口
printerPort : xxx_PORT 中的其中一个
fs: 已打开的端口fs
str: 字符串
返回:
1 :  发送成功
0 :  发送失败
-1 : 申请数据内存失败
-2 : str里的数据格式不正确,转换失败
-3 printerPort 参数错误
*/
ZYPRINTERDLL_API int ZYFUNcall SendHexByStringW(int printerPort, int fs,  const wchar_t* str);
ZYPRINTERDLL_API int ZYFUNcall SendHexByStringA(int printerPort, int fs,  const char* str);

/*从指定的端口发送字符串,使用指定的代码页
codePage : 详细数值请参考最底部的代码页表格, 例如:GB2312 则 codePage=936
*/
ZYPRINTERDLL_API int ZYFUNcall SendStringW(int printerPort, int fs,  const wchar_t* str, int codePage);
ZYPRINTERDLL_API int ZYFUNcall SendStringA(int printerPort, int fs,  const char* str);

/*
发送切纸指令
mode: 0->全切, 其它半切
*/
ZYPRINTERDLL_API int ZYFUNcall SendCmd_CutPaper(int printerPort, int fs, int mode);
/*
发送打印并换行指令
line: 换数 0<line<100
*/
ZYPRINTERDLL_API int ZYFUNcall SendCmd_LineFeed(int printerPort, int fs, int line);

/********网口打印机操作API*************/
ZYPRINTERDLL_API int ZYFUNcall InitNetSev(); //启动SOCKET服务
ZYPRINTERDLL_API int ZYFUNcall ConnectNetPort(int addr, int port, int Timeout);

/*
功能同ConnectNetPort
对应参数格式
192  .168  .1    .1
addr0.addr1.addr2.addr3
*/
ZYPRINTERDLL_API int ZYFUNcall ConnectNetPortEx(int addr0, int addr1, int addr2, int addr3, int port, int Timeout);

/*
从指定的连接,发送sendbuf缓冲区的数据
UINT16 fs : ConnectNetPort成功返回的句柄
char *SendBuf : 要发送的数据缓冲区地址
UINT16 WriteSize : 要发送的数据长度(byte)
返回实际发送的字节数
*/
ZYPRINTERDLL_API int ZYFUNcall WriteToNetPort(int fs, char *SendBuf, int WriteSize);
/*
从指定的连接,接收数据到缓冲区
UINT16 fs : ConnectNetPort成功返回的句柄
char *SendBuf : 接收数据缓冲区地址
UINT16 WriteSize : 接收缓冲区大小(byte)
返回实际接收到的字节数
*/
ZYPRINTERDLL_API int ZYFUNcall ReadFromNetPort(int fs, char *RecvBuf, int RecvBufSize);
ZYPRINTERDLL_API int ZYFUNcall CloseNetPor(int fs);
ZYPRINTERDLL_API int ZYFUNcall CloseNetServ();
ZYPRINTERDLL_API int ZYFUNcall Netportwrite(int addr, int port, int Timeout, int iLen, char* Data);

/********USB口打印机操作API**************/
ZYPRINTERDLL_API int ZYFUNcall OpenUsb();
ZYPRINTERDLL_API int ZYFUNcall OpenUsbTO(int timeOut);
ZYPRINTERDLL_API int ZYFUNcall OpenUsbEx(int vid,int pid);
ZYPRINTERDLL_API int ZYFUNcall WriteUsb(int fs,char *SendBuf, int SendBufSize);
ZYPRINTERDLL_API int ZYFUNcall ReadUsb(int fs,char *ReadBuf,int ReadBufSize );
ZYPRINTERDLL_API int ZYFUNcall CloseUsb(int fs);
ZYPRINTERDLL_API int ZYFUNcall usbportwrite(char* VId, char* PId, UINT32 iLen, char* Data);

/********并口打印机操作API**************/
ZYPRINTERDLL_API int ZYFUNcall OpenLptW(char* Name);
ZYPRINTERDLL_API int ZYFUNcall OpenLptA(LPCSTR lpLptName);
ZYPRINTERDLL_API int ZYFUNcall WriteLpt(int fs, char *SendBuf, int SendBufSize);
ZYPRINTERDLL_API int ZYFUNcall ReadLpt(int fs, char *ReadBuf, int ReadBufSize);
ZYPRINTERDLL_API int ZYFUNcall CloseLpt(int fs);
ZYPRINTERDLL_API int ZYFUNcall Lptportwrite(char* Name, int iLen, char* Data);

/***********************串口打印机操作API**************/
ZYPRINTERDLL_API int ZYFUNcall OpenComW(char *Com,
										UINT32 BaudRate,
										UINT8 Parity,
										UINT8 ByteSize,
										UINT8 fDtrControl,
										UINT8 StopBits);

ZYPRINTERDLL_API HANDLE ZYFUNcall OpenComA(LPCSTR lpCom,DWORD BaudRate);
ZYPRINTERDLL_API int    ZYFUNcall ReadCom(UINT16 fs, char *ReadBuf, UINT16 SendBufSize );
ZYPRINTERDLL_API int    ZYFUNcall WriteCom(UINT16 fs, char *SendBuf, DWORD WriteSize);
ZYPRINTERDLL_API BOOL   ZYFUNcall CloseCom(UINT16 fs);
ZYPRINTERDLL_API int    ZYFUNcall comportwrite(char *Com,
										UINT32 BaudRate,
										UINT8 Parity,
										UINT8 ByteSize,
										UINT8 fDtrControl,
										UINT8 StopBits,
										UINT32 iLen,
										char* Data);

/********** 字符串转换所支持的代码页 *********************/
/*
代码页	名称	显示名称
37	IBM037	IBM EBCDIC（美国 - 加拿大）
437	IBM437	OEM 美国
500	IBM500	IBM EBCDIC（国际）
708	ASMO - 708	阿拉伯字符(ASMO 708)
720	DOS - 720	阿拉伯字符(DOS)
737	ibm737	希腊字符(DOS)
775	ibm775	波罗的海字符(DOS)
850	ibm850	西欧字符(DOS)
852	ibm852	中欧字符(DOS)
855	IBM855	OEM 西里尔语
857	ibm857	土耳其字符(DOS)
858	IBM00858	OEM 多语言拉丁语 I
860	IBM860	葡萄牙语(DOS)
861	ibm861	冰岛语(DOS)
862	DOS - 862	希伯来字符(DOS)
863	IBM863	加拿大法语(DOS)
864	IBM864	阿拉伯字符(864)
865	IBM865	北欧字符(DOS)
866	cp866	西里尔字符(DOS)
869	ibm869	现代希腊字符(DOS)
870	IBM870	IBM EBCDIC（多语言拉丁语 2）
874	windows - 874	泰语(Windows)
875	cp875	IBM EBCDIC（现代希腊语）
932	shift_jis	日语(Shift - JIS)
936	gb2312	简体中文(GB2312) *
949	ks_c_5601 - 1987	朝鲜语
950	big5	繁体中文(Big5)
1026	IBM1026	IBM EBCDIC（土耳其拉丁语 5）
1047	IBM01047	IBM 拉丁语 1
1140	IBM01140	IBM EBCDIC（美国 - 加拿大 - 欧洲）
1141	IBM01141	IBM EBCDIC（德国 - 欧洲）
1142	IBM01142	IBM EBCDIC（丹麦 - 挪威 - 欧洲）
1143	IBM01143	IBM EBCDIC（芬兰 - 瑞典 - 欧洲）
1144	IBM01144	IBM EBCDIC（意大利 - 欧洲）
1145	IBM01145	IBM EBCDIC（西班牙 - 欧洲）
1146	IBM01146	IBM EBCDIC（英国 - 欧洲）
1147	IBM01147	IBM EBCDIC（法国 - 欧洲）
1148	IBM01148	IBM EBCDIC（国际 - 欧洲）
1149	IBM01149	IBM EBCDIC（冰岛语 - 欧洲）
1200	utf - 16	Unicode *
1201	unicodeFFFE	Unicode(Big - Endian) *
1250	windows - 1250	中欧字符(Windows)
1251	windows - 1251	西里尔字符(Windows)
1252	Windows - 1252	西欧字符(Windows) *
1253	windows - 1253	希腊字符(Windows)
1254	windows - 1254	土耳其字符(Windows)
1255	windows - 1255	希伯来字符(Windows)
1256	windows - 1256	阿拉伯字符(Windows)
1257	windows - 1257	波罗的海字符(Windows)
1258	windows - 1258	越南字符(Windows)
1361	Johab	朝鲜语(Johab)
10000	macintosh	西欧字符(Mac)
10001	x - mac - japanese	日语(Mac)
10002	x - mac - chinesetrad	繁体中文(Mac)
10003	x - mac - korean	朝鲜语(Mac) *
10004	x - mac - arabic	阿拉伯字符(Mac)
10005	x - mac - hebrew	希伯来字符(Mac)
10006	x - mac - greek	希腊字符(Mac)
10007	x - mac - cyrillic	西里尔字符(Mac)
10008	x - mac - chinesesimp	简体中文(Mac) *
10010	x - mac - romanian	罗马尼亚语(Mac)
10017	x - mac - ukrainian	乌克兰语(Mac)
10021	x - mac - thai	泰语(Mac)
10029	x - mac - ce	中欧字符(Mac)
10079	x - mac - icelandic	冰岛语(Mac)
10081	x - mac - turkish	土耳其字符(Mac)
10082	x - mac - croatian	克罗地亚语(Mac)
12000	utf - 32	Unicode(UTF - 32) *
12001	utf - 32BE	Unicode(UTF - 32 Big - Endian) *
20000	x - Chinese - CNS	繁体中文(CNS)
20001	x - cp20001	TCA 台湾
20002	x - Chinese - Eten	繁体中文(Eten)
20003	x - cp20003	IBM5550 台湾
20004	x - cp20004	TeleText 台湾
20005	x - cp20005	Wang 台湾
20105	x - IA5	西欧字符(IA5)
20106	x - IA5 - German	德语(IA5)
20107	x - IA5 - Swedish	瑞典语(IA5)
20108	x - IA5 - Norwegian	挪威语(IA5)
20127	us - ascii	US - ASCII *
20261	x - cp20261	T.61
20269	x - cp20269	ISO - 6937
20273	IBM273	IBM EBCDIC（德国）
20277	IBM277	IBM EBCDIC（丹麦 - 挪威）
20278	IBM278	IBM EBCDIC（芬兰 - 瑞典）
20280	IBM280	IBM EBCDIC（意大利）
20284	IBM284	IBM EBCDIC（西班牙）
20285	IBM285	IBM EBCDIC（英国）
20290	IBM290	IBM EBCDIC（日语片假名）
20297	IBM297	IBM EBCDIC（法国）
20420	IBM420	IBM EBCDIC（阿拉伯语）
20423	IBM423	IBM EBCDIC（希腊语）
20424	IBM424	IBM EBCDIC（希伯来语）
20833	x - EBCDIC - KoreanExtended	IBM EBCDIC（朝鲜语扩展）
20838	IBM - Thai	IBM EBCDIC（泰语）
20866	koi8 - r	西里尔字符(KOI8 - R)
20871	IBM871	IBM EBCDIC（冰岛语）
20880	IBM880	IBM EBCDIC（西里尔俄语）
20905	IBM905	IBM EBCDIC（土耳其语）
20924	IBM00924	IBM 拉丁语 1
20932	EUC - JP	日语（JIS 0208 - 1990 和 0212 - 1990）
20936	x - cp20936	简体中文(GB2312 - 80) *
20949	x - cp20949	朝鲜语 Wansung *
21025	cp1025	IBM EBCDIC（西里尔塞尔维亚 - 保加利亚语）
21866	koi8 - u	西里尔字符(KOI8 - U)
28591	iso - 8859 - 1	西欧字符(ISO) *
28592	iso - 8859 - 2	中欧字符(ISO)
28593	iso - 8859 - 3	拉丁语 3 (ISO)
28594	iso - 8859 - 4	波罗的海字符(ISO)
28595	iso - 8859 - 5	西里尔字符(ISO)
28596	iso - 8859 - 6	阿拉伯字符(ISO)
28597	iso - 8859 - 7	希腊字符(ISO)
28598	iso - 8859 - 8	希伯来字符(ISO - Visual) *
28599	iso - 8859 - 9	土耳其字符(ISO)
28603	iso - 8859 - 13	爱沙尼亚语(ISO)
28605	iso - 8859 - 15	拉丁语 9 (ISO)
29001	x - Europa	欧罗巴
38598	iso - 8859 - 8 - i	希伯来字符(ISO - Logical) *
50220	iso - 2022 - jp	日语(JIS) *
50221	csISO2022JP	日语（JIS - 允许 1 字节假名） *
50222	iso - 2022 - jp	日语（JIS - 允许 1 字节假名 - SO / SI） *
50225	iso - 2022 - kr	朝鲜语(ISO) *
50227	x - cp50227	简体中文(ISO - 2022) *
51932	euc - jp	日语(EUC) *
51936	EUC - CN	简体中文(EUC) *
51949	euc - kr	朝鲜语(EUC) *
52936	hz - gb - 2312	简体中文(HZ) *
54936	GB18030	简体中文(GB18030) *
57002	x - iscii - de	ISCII 梵文 *
57003	x - iscii - be	ISCII 孟加拉语 *
57004	x - iscii - ta	ISCII 泰米尔语 *
57005	x - iscii - te	ISCII 泰卢固语 *
57006	x - iscii - as	ISCII 阿萨姆语 *
57007	x - iscii - or	ISCII 奥里雅语 *
57008	x - iscii - ka	ISCII 卡纳达语 *
57009	x - iscii - ma	ISCII 马拉雅拉姆字符 *
57010	x - iscii - gu	ISCII 古吉拉特字符 *
57011	x - iscii - pa	ISCII 旁遮普字符 *
65000	utf - 7	Unicode(UTF - 7) *
65001	utf - 8	Unicode(UTF - 8)	*
*/

#if USE_EXTERN_C
#ifdef __cplusplus  
}
#endif  
#endif