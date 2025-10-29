package models

// TodayCoursesResponse 表示今日课程接口返回
type TodayCoursesResponse struct {
	STATUS string         `json:"STATUS"`
	Total  string         `json:"total"`
	Result []CourseRecord `json:"result"`
}

// CourseRecord 表示一条课程日程
type CourseRecord struct {
	ID                 string `json:"id"`
	UUID               string `json:"uuid"`
	CourseID           string `json:"courseId"`
	CourseName         string `json:"courseName"`
	CourseType         string `json:"courseType"`
	WeekDay            string `json:"weekDay"`
	CourseNum          string `json:"courseNum"`
	SemesterID         string `json:"semesterId"`
	SemesterName       string `json:"semesterName"`
	TeacherID          string `json:"teacherId"`
	TeacherName        string `json:"teacherName"`
	TeacherPicURL      string `json:"teacherPicUrl"`
	TeacherAcademy     string `json:"teacherAcademy"`
	ClassroomID        string `json:"classroomId"`
	ClassroomUUID      string `json:"classroomUuid"`
	ClassroomName      string `json:"classroomName"`
	ClassroomLongitude string `json:"classroomLongitude"`
	ClassroomLatitude  string `json:"classroomLatitude"`
	TeachBuildID       string `json:"teachBuildId"`
	TeachBuildUUID     string `json:"teachBuildUuid"`
	TeachBuildName     string `json:"teachBuildName"`
	StoreyID           string `json:"storeyId"`
	StoreyName         string `json:"storeyName"`
	TeachTime          string `json:"teachTime"`
	SignStatus         string `json:"signStatus"`
	ClassBeginTime     string `json:"classBeginTime"`
	EvaluateScore      string `json:"evaluateScore"`
	EvaluateStatus     string `json:"evaluateStatus"`
	SignAssistantID    string `json:"signAssistantId"`
	CloudMeetingRoomID string `json:"cloudMeetingRoomId"`
	AssistantTeaName   string `json:"assistantTeaName"`
	AssistantStuName   string `json:"assistantStuName"`
	CourseSchedType    string `json:"courseSchedType"`
	ClassEndTime       string `json:"classEndTime"`
}
