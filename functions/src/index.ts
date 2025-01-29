import {initializeApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {onRequest} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/scheduler";

initializeApp();
export const db = getFirestore();

export const helloWorld = onRequest((request, response) => {
  logger.info("Hello logs!", {structuredData: true});
  response.send("Hello from Firebase!");
});

export const oscillateActive = onSchedule(
  {
    schedule: "* * * * *", // cron 표현식 (1분마다)
    invoker: "public", // 공개로 설정 (Cloud Scheduler 호출 가능)
  },
  async () => {
    try {
      // load main room policy
      const mainRoomRef = db.collection("policy").doc("main_room");
      const mainRoomDoc = await mainRoomRef.get();

      // (1) "문서 존재" 체크: mainRoomDoc.exists
      if (!mainRoomDoc.exists) {
        console.log("main_room 문서가 존재하지 않음");
        return;
      }
      // (2) 문서가 존재한다면 데이터 가져오기
      const mainRoomData = mainRoomDoc.data();
      if (!mainRoomData) {
        console.log("main_room 데이터가 없음");
        return;
      }
      // (3) room_id가 있는지 확인
      if (!mainRoomData.room_id) {
        console.log("main_room 문서에 room_id 필드가 없음");
        return;
      }

      // load main room data
      const roomRef = db.collection("chatrooms").doc(mainRoomData.room_id);
      const roomDoc = await roomRef.get();
      if (!roomDoc.exists) {
        console.log("chatrooms 문서가 존재하지 않음:", mainRoomData.room_id);
        return;
      }
      const roomData = roomDoc.data();
      const currentCount = roomData?.active_count ?? 0; // 없으면 기본값 0

      // load active count policy
      const activeCountPolicyRef = db.collection("policy").doc("active_count");
      const activeCountPolicyDoc = await activeCountPolicyRef.get();
      if (!activeCountPolicyDoc.exists) {
        console.log("active_count 문서가 존재하지 않음");
        return;
      }
      const activeCountPolicyData = activeCountPolicyDoc.data();

      // calculate next active count
      const maxCount = activeCountPolicyData?.max_active_count ?? 100;
      const minCount = activeCountPolicyData?.min_active_count ?? 0;
      const probInc = 1 - (currentCount - minCount) / (maxCount - minCount);

      const maxDiffRatio = 0.08;
      const maxDiff = currentCount * maxDiffRatio;
      const diff = Math.round(Math.random() * maxDiff);
      const sign = Math.random() < probInc ? 1 : -1;
      const nextCount = currentCount + sign * diff;

      // Firestore 업데이트 (비동기)
      await roomRef.update({active_count: nextCount});

      console.log(`Updated active_count from ${currentCount} to ${nextCount}`);
      return;
    } catch (error) {
      console.error("Error in oscillateActive:", error);
      return;
    }
  }
);
