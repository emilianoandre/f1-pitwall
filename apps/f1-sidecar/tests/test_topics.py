from f1_sidecar.topics import ORIGIN, REFERER, TOPICS, WS_URL


def test_topics_include_the_previously_missing_ones():
    assert "CarData.z" in TOPICS
    assert "Position.z" in TOPICS


def test_topics_include_pit_lane_time_collection():
    # state/derived.ts reads raw.PitLaneTimeCollection.PitTimes for pit-stop
    # history — must stay in the list even though a real browser doesn't
    # request it.
    assert "PitLaneTimeCollection" in TOPICS


def test_topics_has_no_duplicates():
    assert len(TOPICS) == len(set(TOPICS))


def test_origin_is_the_www_formula1_widget():
    assert ORIGIN == "https://www.formula1.com"
    assert REFERER.startswith(ORIGIN)


def test_ws_url_is_signalrcore():
    assert WS_URL == "wss://livetiming.formula1.com/signalrcore"
