let conversation = [];

let chats = JSON.parse(
    localStorage.getItem("nexus_chats") || "[]"
);

let currentChat = null;


const messages =
    document.getElementById("messages");

const input =
    document.getElementById("messageInput");

const sendButton =
    document.getElementById("sendButton");

const newChatButton =
    document.getElementById("newChat");

const history =
    document.getElementById("history");

const menuButton =
    document.getElementById("menuButton");

const sidebar =
    document.querySelector(".sidebar");

const aiSelector =
    document.getElementById("aiSelector");



function showWelcome() {

    messages.innerHTML = `
        <div class="welcome">

            <div class="welcome-icon">
                ✦
            </div>

            <h1>Hola 👋</h1>

            <p>
                Soy Nexus. ¿En qué puedo ayudarte?
            </p>

            <div class="suggestions">

                <button data-prompt="Explícame algo interesante">
                    💡 Explícame algo interesante
                </button>

                <button data-prompt="Ayúdame a crear una idea">
                    ✨ Ayúdame a crear una idea
                </button>

                <button data-prompt="Ayúdame a programar">
                    💻 Ayúdame a programar
                </button>

            </div>

        </div>
    `;


    document
        .querySelectorAll("[data-prompt]")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    input.value =
                        button.dataset.prompt;

                    sendMessage();

                }
            );

        });
}



sendButton.addEventListener(
    "click",
    sendMessage
);


input.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Enter" &&
            !event.shiftKey
        ) {

            event.preventDefault();

            sendMessage();

        }

    }
);


async function sendMessage() {

    const text =
        input.value.trim();


    if (
        !text ||
        sendButton.disabled
    ) {

        return;

    }


    const welcome =
        document.querySelector(".welcome");


    if (welcome) {
        welcome.remove();
    }


    input.value = "";

    input.style.height = "auto";


    addMessage(
        "user",
        text
    );


    conversation.push({

        role: "user",

        content: text

    });


    sendButton.disabled = true;


    const thinking =
        addMessage(
            "ai",
            "Pensando..."
        );


    try {


        const selectedModel =
            aiSelector.value;


        const response =
            await puter.ai.chat(

                conversation,

                {
                    model: selectedModel
                }

            );


        thinking.remove();


        let answer = "";


        if (
            typeof response === "string"
        ) {

            answer = response;

        }

        else if (
            response?.message?.content
        ) {

            answer =
                response.message.content;

        }

        else if (
            response?.content
        ) {

            answer =
                response.content;

        }

        else {

            answer =
                JSON.stringify(response);

        }


        addMessage(
            "ai",
            answer
        );


        conversation.push({

            role: "assistant",

            content: answer

        });


        saveCurrentChat();


    }

    catch (error) {

        thinking.remove();

        console.error(error);


        addMessage(
            "ai",
            "❌ No pude conectar con esta IA. Prueba con otra."
        );

    }


    sendButton.disabled = false;

    input.focus();

}



function addMessage(type, text) {

    const message =
        document.createElement("div");


    message.className =
        "message";


    const avatar =
        document.createElement("div");


    avatar.className =
        "avatar " +
        (
            type === "user"
                ? "user-avatar"
                : "ai-avatar"
        );


    avatar.textContent =
        type === "user"
            ? "Tú"
            : "N";


    const content =
        document.createElement("div");


    content.className =
        "message-content";


    const name =
        document.createElement("div");


    name.className =
        "message-name";


    name.textContent =
        type === "user"
            ? "Tú"
            : "Nexus";


    const textElement =
        document.createElement("div");


    textElement.className =
        "message-text";


    textElement.textContent =
        text;


    content.appendChild(name);

    content.appendChild(textElement);

    message.appendChild(avatar);

    message.appendChild(content);


    messages.appendChild(message);


    messages.scrollTop =
        messages.scrollHeight;


    return message;
}



function saveCurrentChat() {

    if (
        conversation.length === 0
    ) {

        return;

    }


    const first =
        conversation.find(
            message =>
                message.role === "user"
        );


    if (!first) return;


    if (!currentChat) {

        currentChat = {

            id: Date.now(),

            title:
                first.content.substring(
                    0,
                    35
                ),

            messages:
                conversation

        };


        chats.unshift(
            currentChat
        );

    }

    else {

        currentChat.messages =
            conversation;

    }


    chats =
        chats.slice(0, 30);


    localStorage.setItem(
        "nexus_chats",
        JSON.stringify(chats)
    );


    renderHistory();
}



function renderHistory() {

    history.innerHTML = "";


    chats.forEach(chat => {

        const item =
            document.createElement("div");


        item.className =
            "history-item";


        item.textContent =
            chat.title;


        item.addEventListener(
            "click",
            () => loadChat(chat)
        );


        history.appendChild(item);

    });
}


function loadChat(chat) {

    currentChat = chat;


    conversation =
        [...chat.messages];


    messages.innerHTML = "";


    conversation.forEach(
        message => {

            addMessage(

                message.role === "user"
                    ? "user"
                    : "ai",

                message.content

            );

        }
    );


    sidebar.classList.remove(
        "open"
    );
}



newChatButton.addEventListener(
    "click",
    () => {

        conversation = [];

        currentChat = null;

        showWelcome();

        input.focus();

    }
);


input.addEventListener(
    "input",
    () => {

        input.style.height =
            "auto";


        input.style.height =
            Math.min(
                input.scrollHeight,
                150
            ) + "px";

    }
);



menuButton.addEventListener(
    "click",
    () => {

        sidebar.classList.toggle(
            "open"
        );

    }
);


renderHistory();

showWelcome();