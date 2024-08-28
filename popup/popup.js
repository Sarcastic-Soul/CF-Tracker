document.addEventListener('DOMContentLoaded', () => {
    const userIdInput = document.getElementById('friend-handle');
    const userList = document.getElementById('friend-list');
    const contestList = document.getElementById('contest-list');
    const statusIcon = document.getElementById('statusIcon');
    const addFriendBtn = document.getElementById('add-friend');
    const msg = document.getElementById('message');
    const timeframeSelect = document.getElementById('timeframe');
    const problemsTab = document.getElementById('problems-tab');
    const contestsTab = document.getElementById('contests-tab');
    const settingsTab = document.getElementById('settings-tab');
    const problemsContent = document.getElementById('problems-content');
    const contestsContent = document.getElementById('contests-content');
    const settingsContent = document.getElementById('settings-content');
    const friendSettingsList = document.getElementById('friend-settings-list');
    const filterContainer = document.querySelector('.filter-container');

    userIdInput.addEventListener('input', checkUser);
    addFriendBtn.addEventListener('click', addUser);
    timeframeSelect.addEventListener('change', loadFriends);
    timeframeSelect.addEventListener('change', loadContestSubmissions);
    problemsTab.addEventListener('click', () => switchTab('problems'));
    contestsTab.addEventListener('click', () => switchTab('contests'));
    settingsTab.addEventListener('click', () => switchTab('settings'));



    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync') {
            if ('friends' in changes) {
                loadFriends();
            }
        }
    });

    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'updateFriendList') {
            loadFriends();
        }
    });

    async function checkUser() {
        const userId = userIdInput.value.trim();

        if (userId === '') {
            statusIcon.className = '';
            return;
        }

        try {
            const response = await fetch(`https://codeforces.com/api/user.info?handles=${userId}`);
            const data = await response.json();

            statusIcon.className = (data.status === 'OK' && data.result.length > 0) ? 'valid' : 'invalid';
        } catch (error) {
            console.error('Error fetching user:', error);
            statusIcon.className = 'invalid';
        }
    }

    async function addUser() {
        const userId = userIdInput.value.trim();

        if (userId === '') {
            msg.innerText = 'Please enter a user ID.';
            return;
        }

        try {
            const response = await fetch(`https://codeforces.com/api/user.info?handles=${userId}`);
            const data = await response.json();

            if (data.status === 'OK' && data.result.length > 0) {
                const user = data.result[0];

                chrome.storage.sync.get(['friends'], async function (result) {
                    const friends = result.friends || [];

                    // Check if the user is already in the list
                    const userExists = friends.some(friend => friend.handle === user.handle);

                    if (userExists) {
                        msg.innerText = 'User is already in the list.';
                        return;
                    }

                    const solvedCount = await getSolvedCount(userId, timeframeSelect.value);

                    const userData = {
                        handle: user.handle,
                        rating: user.rating || 'No rating',
                        solvedCount: solvedCount.count,
                        points: solvedCount.points
                    };

                    await saveFriend(userData);
                    userIdInput.value = '';
                    statusIcon.className = 'valid';
                    msg.innerText = '';
                });
            } else {
                msg.innerText = 'User not found';
            }
        } catch (error) {
            console.error('Error fetching user:', error);
            msg.innerText = 'Error fetching user data';
        }
    }



    async function getSolvedCount(handle, timeframe) {
        try {
            const response = await fetch(`https://codeforces.com/api/user.status?handle=${handle}`);
            const data = await response.json();
            if (data.status === 'OK') {
                const submissions = data.result;
                const solvedProblems = new Set();
                const now = new Date();
                let totalPoints = 0;

                submissions.forEach(submission => {
                    if (submission.verdict === 'OK') {
                        const submissionTime = new Date(submission.creationTimeSeconds * 1000);
                        let timeDifference = now - submissionTime;
                        let timeFrameMillis;

                        switch (timeframe) {
                            case '24hrs':
                                timeFrameMillis = 24 * 60 * 60 * 1000;
                                break;
                            case '1week':
                                timeFrameMillis = 7 * 24 * 60 * 60 * 1000;
                                break;
                            case '1month':
                                timeFrameMillis = 30 * 24 * 60 * 60 * 1000;
                                break;
                            case '1year':
                                timeFrameMillis = 365 * 24 * 60 * 60 * 1000;
                                break;
                            default:
                                timeFrameMillis = Infinity;
                        }

                        if (timeDifference <= timeFrameMillis) {
                            const problemId = submission.problem.contestId + '-' + submission.problem.index;
                            if (!solvedProblems.has(problemId)) {
                                solvedProblems.add(problemId);
                                totalPoints += calculatePoints(submission.problem.rating);
                            }
                        }
                    }
                });

                return { count: solvedProblems.size, points: totalPoints };
            }
        } catch (error) {
            console.error('Error fetching solved count:', error);
        }
        return { count: 'Unknown', points: 0 };
    }

    function calculatePoints(rating) {
        if (rating >= 800 && rating <= 900) return 1;
        if (rating >= 1000 && rating <= 1100) return 2;
        if (rating >= 1200 && rating <= 1300) return 3;
        if (rating >= 1400 && rating <= 1500) return 4;
        if (rating >= 1600 && rating <= 1700) return 5;
        if (rating >= 1800 && rating <= 1900) return 6;
        if (rating >= 2000 && rating <= 2100) return 7;
        if (rating >= 2200 && rating <= 2300) return 8;
        if (rating >= 2400 && rating <= 2500) return 9;
        if (rating >= 2600) return 10;
        return 0;
    }

    async function loadFriends() {
        const timeframe = timeframeSelect.value;
        chrome.storage.sync.get(['friends'], async function (result) {
            const friends = result.friends || [];

            const friendsWithCounts = await Promise.all(friends.map(async (friend) => {
                const { count, points } = await getSolvedCount(friend.handle, timeframe);
                return { ...friend, solvedCount: count, points };
            }));

            friendsWithCounts.sort((a, b) => b.points - a.points);

            userList.innerHTML = '';

            friendsWithCounts.forEach(friend => addFriendToList(friend, 'problems'));
        });
    }

    function addFriendToList(friend, tab) {
        const tr = document.createElement('tr');
        tr.id = friend.handle;

        const content = tab === 'problems' ?
            `<td><a href="https://codeforces.com/profile/${friend.handle}" target="_blank">${friend.handle}</a></td> <td>${friend.solvedCount}</td> <td>${friend.points}</td>` :
            `<td><a href="https://codeforces.com/profile/${friend.handle}" target="_blank">${friend.handle}</a></td> <td>${friend.submissions.length}</td> <td>${friend.rating}</td>`;

        tr.innerHTML = content
        userList.appendChild(tr);
    }


    async function loadContestSubmissions() {
        const timeframe = timeframeSelect.value;
        chrome.storage.sync.get(['friends'], async function (result) {
            const friends = result.friends || [];

            // Get contest counts for all friends within the timeframe
            const contestCounts = await Promise.all(friends.map(async (friend) => {
                const contestCount = await getContestCountWithinTimeframe(friend.handle, timeframe);
                return { handle: friend.handle, contestCount, rating: friend.rating };
            }));

            // Sort friends by contestCount in descending order
            contestCounts.sort((a, b) => {
                const ratingA = (a.rating === 'No rating') ? -Infinity : a.rating;
                const ratingB = (b.rating === 'No rating') ? -Infinity : b.rating;
                return ratingB - ratingA;
            });

            contestList.innerHTML = '';

            contestCounts.forEach(data => addContestToList(data));
        });
    }

    function addContestToList(data) {
        const tr = document.createElement('tr');
        tr.id = data.handle;
        tr.innerHTML = `<td><a href="https://codeforces.com/profile/${data.handle}" target="_blank">${data.handle}</a></td> <td>${data.contestCount}</td> <td>${data.rating}</td>`;
        contestList.appendChild(tr);

    }



    async function getContestCountWithinTimeframe(handle, timeframe) {
        try {
            const response = await fetch(`https://codeforces.com/api/user.status?handle=${handle}`);
            const data = await response.json();
            if (data.status === 'OK') {
                const submissions = data.result;
                const now = new Date();

                // Filter submissions by participantType 'CONTESTANT' and by timeframe
                const contestantSubmissions = submissions.filter(submission => {
                    const submissionTime = new Date(submission.creationTimeSeconds * 1000);
                    const timeDifference = now - submissionTime;

                    let timeFrameMillis;

                    switch (timeframe) {
                        case '24hrs':
                            timeFrameMillis = 24 * 60 * 60 * 1000;
                            break;
                        case '1week':
                            timeFrameMillis = 7 * 24 * 60 * 60 * 1000;
                            break;
                        case '1month':
                            timeFrameMillis = 30 * 24 * 60 * 60 * 1000;
                            break;
                        case '1year':
                            timeFrameMillis = 365 * 24 * 60 * 60 * 1000;
                            break;
                        default:
                            timeFrameMillis = Infinity;
                    }

                    return submission.author.participantType === 'CONTESTANT' && timeDifference <= timeFrameMillis;
                });

                // Use a Set to track unique contest IDs
                const uniqueContests = new Set();

                contestantSubmissions.forEach(submission => {
                    uniqueContests.add(submission.contestId);
                });

                return uniqueContests.size;
            }
        } catch (error) {
            console.error('Error fetching contest count:', error);
        }
        return 0;
    }


    function removeUser(userId) {
        const userItem = document.getElementById(userId);
        if (userItem) {
            userItem.remove();
            removeFriend(userId);
        }
    }

    function saveFriend(friendData) {
        return new Promise((resolve, reject) => {
            chrome.storage.sync.get(['friends'], function (result) {
                let friends = result.friends || [];
                const existingFriendIndex = friends.findIndex(friend => friend.handle === friendData.handle);
                if (existingFriendIndex !== -1) {
                    friends[existingFriendIndex] = friendData;
                } else {
                    friends.push(friendData);
                }
                chrome.storage.sync.set({ friends: friends }, () => {
                    resolve();
                    chrome.runtime.sendMessage({ action: 'updateFriendList' });
                });
            });
        });
    }

    function removeFriend(handle) {
        chrome.storage.sync.get(['friends'], function (result) {
            let friends = result.friends || [];
            friends = friends.filter(friend => friend.handle !== handle);
            chrome.storage.sync.set({ friends: friends }, () => {
                chrome.runtime.sendMessage({ action: 'updateFriendList' });
            });
        });
    }

    async function loadFriendSettingsList() {
        chrome.storage.sync.get(['friends'], function (result) {
            const friends = result.friends || [];
            friendSettingsList.innerHTML = '';
            friends.forEach(friend => addFriendToSettingsList(friend));
        });
    }

    function addFriendToSettingsList(friend) {
        const li = document.createElement('li');
        li.id = friend.handle;
        li.innerHTML = `${friend.handle} <button class="delete">Delete</button>`;
        friendSettingsList.appendChild(li);

        li.querySelector('.delete').addEventListener('click', () => removeUser(friend.handle));
    }

    function switchTab(tab) {
        if (tab === 'problems') {
            problemsTab.classList.add('active');
            contestsTab.classList.remove('active');
            settingsTab.classList.remove('active');
            problemsContent.classList.add('active');
            contestsContent.classList.remove('active');
            settingsContent.classList.remove('active');
            filterContainer.classList.remove('hidden');
            loadFriends();
        } else if (tab === 'contests') {
            contestsTab.classList.add('active');
            problemsTab.classList.remove('active');
            settingsTab.classList.remove('active');
            contestsContent.classList.add('active');
            problemsContent.classList.remove('active');
            settingsContent.classList.remove('active');
            filterContainer.classList.remove('hidden');
            loadContestSubmissions();
        } else if (tab === 'settings') {
            settingsTab.classList.add('active');
            problemsTab.classList.remove('active');
            contestsTab.classList.remove('active');
            settingsContent.classList.add('active');
            problemsContent.classList.remove('active');
            contestsContent.classList.remove('active');
            filterContainer.classList.add('hidden');
            loadFriendSettingsList();
        }
    }

    switchTab('problems');
});