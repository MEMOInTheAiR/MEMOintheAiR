import HomeSvg from "@/assets/images/home.svg";
import MapMarkerSvg from "@/assets/images/mapMarker.svg";
import PlusSvg from "@/assets/images/plus.svg";
import { MAIN_PAGE, MEMO_LIST_PAGE } from "@/constants/Pages";
import { COMPASS_UPDATE_RATE } from "@/constants/Variable";
import { getMemoList } from "@/firebase/memo";
import { useBoundStore } from "@/store/useBoundStore";
import { fixToSixDemicalPoints } from "@/utils/number";
import { setXPosition, setYPosition, setZPosition } from "@/utils/position";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import CompassHeading from "react-native-compass-heading";
import Geolocation from "react-native-geolocation-service";
import { WebView, WebViewMessageEvent } from "react-native-webview";

export default function ARWebView() {
  const userId = useBoundStore((state) => state.userId);
  const memoList = useBoundStore((state) => state.memoList);
  const setMemoList = useBoundStore((state) => state.setMemoList);
  const userLocation = useBoundStore((state) => state.userLocation);
  const setMemoLocation = useBoundStore((state) => state.setMemoLocation);
  const differenceCoords = useBoundStore((state) => state.differenceCoords);
  const setDifferenceCoords = useBoundStore((state) => state.setDifferenceCoords);

  const webViewRef = useRef<WebView>(null);
  const compassHeading = useRef<number>(0);
  const [isGridVisible, setIsGridVisible] = useState<boolean>(false);
  const [changedPosition, setChangedPosition] = useState({
    latitude: 0,
    longitude: 0,
    altitude: 0,
  });

  useEffect(() => {
    getUserMemoList();
    subscribeCompass();
    subscribePosition();
    getDifferenceCoords();

    return () => {
      CompassHeading.stop();
      Geolocation.stopObserving();
    };
  }, []);

  useEffect(() => {
    updateDevicePosition(
      changedPosition.latitude - differenceCoords.latitude,
      changedPosition.longitude - differenceCoords.longitude,
      (changedPosition.altitude || 0) - differenceCoords.altitude,
    );
  }, [changedPosition]);

  async function getUserMemoList(): Promise<void> {
    const memoList = await getMemoList(userId);
    setMemoList(memoList || []);
  }

  function subscribeCompass(): void {
    CompassHeading.start(COMPASS_UPDATE_RATE, ({ heading }: { heading: string }) => {
      compassHeading.current = Number(heading);
    });
  }

  function getDifferenceCoords() {
    Geolocation.getCurrentPosition(
      (position) => {
        console.log(position);
        setDifferenceCoords({
          latitude: position.coords.latitude - userLocation.latitude,
          longitude: position.coords.longitude - userLocation.longitude,
          altitude: (position.coords.altitude || 0) - userLocation.altitude,
        });
      },
      (error) => {
        console.error(error);
      },
      { enableHighAccuracy: true, distanceFilter: 1 },
    );
  }

  function subscribePosition(): void {
    Geolocation.watchPosition(
      (position) => {
        setChangedPosition({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          altitude: position.coords.altitude || 0,
        });
      },
      (error) => {
        console.error(error);
      },
      { enableHighAccuracy: true, distanceFilter: 0.1 },
    );
  }

  function updateDevicePosition(
    userLatitude: number,
    userLongitude: number,
    userAltitude: number,
  ): void {
    let memoHtmlToUpdate = "";
    for (const memo of Object.values(memoList)) {
      const movingXPosition: number = fixToSixDemicalPoints(
        setXPosition(userLocation.latitude, memo.latitude) -
          setXPosition(userLocation.latitude, userLatitude),
      );
      const movingYPosition: number = fixToSixDemicalPoints(
        setYPosition(userLocation.altitude, memo.altitude) -
          setYPosition(userLocation.altitude, userAltitude),
      );
      const movingZPosition: number = fixToSixDemicalPoints(
        setZPosition(userLocation.longitude, memo.longitude) -
          setZPosition(userLocation.longitude, userLongitude),
      );

      memoHtmlToUpdate += `
        if (document.getElementById("${memo.memoId}") !== null) {
          document.getElementById("${memo.memoId}").position = "${movingXPosition} ${movingYPosition} ${movingZPosition}";
        }
      `;
    }
    memoHtmlToUpdate += "true;";

    webViewRef.current?.injectJavaScript(memoHtmlToUpdate);
  }

  function getMemoCurrentLocation(): void {
    Geolocation.getCurrentPosition(
      (position) => {
        const memoCoords = position.coords;
        setMemoLocation({
          latitude: fixToSixDemicalPoints(memoCoords.latitude) - differenceCoords.latitude,
          longitude: fixToSixDemicalPoints(memoCoords.longitude) - differenceCoords.longitude,
          altitude: fixToSixDemicalPoints(memoCoords.altitude || 0) - differenceCoords.altitude,
          direction: compassHeading.current,
        });
      },
      (error) => {
        console.error(error);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  }

  function handleWebViewMessage(event: WebViewMessageEvent): void {
    const type: string = event.nativeEvent.data;
    getMemoCurrentLocation();

    if (type === "grid-click") {
      router.push("/memoEdit");
    }
  }

  function handleMoveToHome(): void {
    router.dismissAll();
    router.push("/home");
  }

  function handleMoveToMemoList(): void {
    router.push("/memoMap");
  }

  function putMemoList(): string | undefined {
    if (
      Object.keys(memoList).length === 0 ||
      userLocation.latitude === 0 ||
      userLocation.longitude === 0 ||
      userLocation.altitude === 0
    ) {
      return;
    }

    let index = 0;
    let memoHtmlToAdd = "";

    for (const memo of Object.values(memoList)) {
      const xPosition: number = setXPosition(userLocation.latitude, memo.latitude);
      const yPosition: number = setYPosition(userLocation.altitude, memo.altitude);
      const zPosition: number = setZPosition(userLocation.longitude, memo.longitude);
      const memoSize =
        Math.abs(Number(zPosition.toFixed(0))) === 0
          ? 2.5
          : 2 + Math.abs(Number(zPosition.toFixed(0))) * 0.5;

      if (Math.abs(xPosition) <= 100 && Math.abs(yPosition) <= 100 && Math.abs(zPosition) <= 100) {
        memoHtmlToAdd += `
          const memoText${index} = document.createElement("a-entity");
          memoText${index}.setAttribute("text", {
            value: "${memo.content}",
            color: "#000000",
            align: "center",
          });
          memoText${index}.setAttribute("position", "0 0 0.001");
          memoText${index}.setAttribute("scale", "${memoSize * 3} ${memoSize * 3} 0");

          const memo${index} = document.createElement("a-plane");
          memo${index}.setAttribute("id", "${memo.memoId}");
          memo${index}.setAttribute("rotation", "0 ${memo.direction} 0");
          memo${index}.setAttribute("position", "${xPosition} ${yPosition} ${zPosition < 0 ? zPosition : -zPosition}");
          memo${index}.setAttribute("material", "color: #FFFF4C;");
          memo${index}.setAttribute("width", "${memoSize}");
          memo${index}.setAttribute("height", "${memoSize}");

          memo${index}.appendChild(memoText${index});
          document.getElementById("aScene")?.appendChild(memo${index});
        `;
        index++;
      }
    }
    memoHtmlToAdd += " true;";

    return memoHtmlToAdd;
  }

  function handleClickPlusButton(): void {
    if (!isGridVisible) {
      setIsGridVisible(true);
      webViewRef.current?.injectJavaScript(`
        const arCamera = document.createElement("a-camera");
        arCamera.setAttribute("id", "arCamera");
        arCamera.setAttribute("gps-new-camera", "");
        arCamera.setAttribute("arjs-device-orientation-controls", "smoothingFactor: 0.1");

        const aPlane = document.createElement("a-plane");
        aPlane.setAttribute("position", "0 0 -3");
        aPlane.setAttribute("rotation", "0 0 0");
        aPlane.setAttribute("width", "1.5");
        aPlane.setAttribute("height", "1.5");
        aPlane.setAttribute("material", "color: #FFFF4C; opacity: 0.7;");
        aPlane.setAttribute("id", "memoGrid");

        arCamera.appendChild(aPlane);
        document.getElementById("aScene").appendChild(arCamera);

        document.getElementById("aScene").addEventListener("click", function () {
          window.ReactNativeWebView.postMessage("grid-click");
        });

        true;
      `);
    }
  }

  return (
    <>
      <WebView
        ref={webViewRef}
        source={{ uri: "https://memointheair-ar.netlify.app/" }}
        javaScriptEnabled={true}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback={true}
        injectedJavaScript={putMemoList()}
        onMessage={handleWebViewMessage}
        mediaCapturePermissionGrantType={"grantIfSameHostElsePrompt"}
        style={styles.arContainer}
      />

      <View style={styles.bottomContainer}>
        <Pressable style={styles.iconContainer} onPress={handleMoveToHome}>
          <HomeSvg width="38%" height="38%" color="#343A40" />
          <Text style={styles.homeText}>{MAIN_PAGE}</Text>
        </Pressable>

        {isGridVisible ? (
          <View style={styles.plusIconContainer}></View>
        ) : (
          <Pressable style={styles.plusIconContainer} onPress={handleClickPlusButton}>
            <PlusSvg width="70%" height="70%" color="#5E8BCE" />
          </Pressable>
        )}

        <Pressable style={styles.iconContainer} onPress={handleMoveToMemoList}>
          <MapMarkerSvg width="34%" height="34%" color="#343A40" />
          <Text style={styles.listText}>{MEMO_LIST_PAGE}</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  arContainer: {
    flex: 1,
  },
  bottomContainer: {
    flex: 0.15,
    flexDirection: "row",
  },
  iconContainer: {
    flex: 1,
    alignItems: "center",
    marginTop: 10,
  },
  homeText: {
    fontFamily: "SUITE-Regular",
    fontSize: 15,
    marginTop: 8,
    color: "#343A40",
  },
  listText: {
    fontFamily: "SUITE-Regular",
    fontSize: 15,
    marginTop: 10,
    color: "#343A40",
  },
  plusIconContainer: {
    flex: 1,
    alignItems: "center",
    marginTop: 3,
  },
});
