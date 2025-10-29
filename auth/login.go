package auth

type LoginParams struct {
	Phone            string `json:"phone"`
	Password         string `json:"password"`
	UserLevel        string `json:"userLevel"`
	VerificationType string `json:"verificationType"`
	VerificationURL  string `json:"verificationUrl"`
	SessionID        string `json:"sessionId"`
}

// LoginResponse 表示登录接口返回的顶层结构
type LoginResponse struct {
	STATUS           string   `json:"STATUS"`
	DownloadType     string   `json:"downloadType"`
	SmartOperationIP string   `json:"smartOperationIp"`
	DistrictLevelURL string   `json:"districtLevelUrl"`
	SchoolCode       string   `json:"schoolCode"`
	BigDataIP        string   `json:"bigDataIp"`
	PlayerType       string   `json:"playerType"`
	CalendarType     string   `json:"calendarType"`
	VideoDownType    string   `json:"videoDownType"`
	UserOrgName      string   `json:"userOrgName"`
	IfHuiWuPerson    string   `json:"ifHuiWuPerson"`
	CloudAuth        string   `json:"cloudAuth"`
	InviteFlag       string   `json:"inviteFlag"`
	TencentMeeting   string   `json:"tencentMeeting"`
	RoleCodes        string   `json:"roleCodes"`
	RoleNames        string   `json:"roleNames"`
	Result           UserInfo `json:"result"`
}

// UserInfo 表示返回中的用户信息详情
type UserInfo struct {
	ID             string `json:"id"`
	SessionID      string `json:"sessionId"`
	Phone          string `json:"phone"`
	UserName       string `json:"userName"`
	NickName       string `json:"nickName"`
	RealName       string `json:"realName"`
	Gender         string `json:"gender"`
	UserLevel      string `json:"userLevel"`
	PicURL         string `json:"picUrl"`
	FriendAuth     string `json:"friendAuth"`
	SearchAuth     string `json:"searchAuth"`
	NoteAuth       string `json:"noteAuth"`
	AcademyID      string `json:"academyId"`
	AcademyName    string `json:"academyName"`
	PriSubject     string `json:"priSubject"`
	PriSubjectName string `json:"priSubjectName"`
	ClassID        string `json:"classId"`
	ClassInfoName  string `json:"classInfoName"`
	ClassUUID      string `json:"classUUID"`
	UserUUID       string `json:"userUUID"`
	Description    string `json:"description"`
	CloudIP        string `json:"cloudIp"`
	CloudFlag      string `json:"cloudFlag"`
	StudentNo      string `json:"studentNo"`
}

// TodayCourseParams 表示获取今日课程接口的输入
type TodayCourseParams struct {
	ID        string `json:"id"`
	DateStr   string `json:"dateStr"`
	SessionID string `json:"sessionId"`
}
